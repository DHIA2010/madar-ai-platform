import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export type StorePlatform = "Salla" | "Shopify" | "Zid"
// Real enum straight from <provider>_oauth_connections.status -- passed through as-is rather
// than remapped into invented labels like "Needs Reconnect" that don't correspond to a real state.
export type StoreConnectionStatus = "pending" | "connected" | "paused" | "disconnected" | "error"
export type StoreSyncRunStatus = "pending" | "running" | "completed" | "failed"
// Heuristic over real sync_runs rows (not a synced field) -- documented thresholds below so
// they're easy to revisit, same pattern as customers/service.ts's computeStatus.
export type StoreSyncHealth = "healthy" | "stale" | "failed" | "never_synced"

export interface StoreSummary {
  id: string
  name: string
  platform: StorePlatform
  url: string | null
  currency: string | null
  timeZone: string | null
  connectionStatus: StoreConnectionStatus
  productCount: number
  orderCount: number
  customerCount: number
  lastSyncAt: string | null
  lastSyncStatus: StoreSyncRunStatus | null
  lastSyncError: string | null
  syncHealth: StoreSyncHealth
  createdAt: string
}

const STALE_AFTER_DAYS = 7

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function daysSince(dateIso: string | null): number | null {
  if (!dateIso) return null
  const then = new Date(dateIso).getTime()
  if (Number.isNaN(then)) return null
  return (Date.now() - then) / (1000 * 60 * 60 * 24)
}

function computeSyncHealth(input: {
  lastRunStatus: StoreSyncRunStatus | null
  lastSyncAt: string | null
}): StoreSyncHealth {
  if (!input.lastRunStatus) {
    return "never_synced"
  }
  if (input.lastRunStatus === "failed") {
    return "failed"
  }
  if (input.lastRunStatus !== "completed") {
    return "stale"
  }
  const age = daysSince(input.lastSyncAt)
  return age !== null && age <= STALE_AFTER_DAYS ? "healthy" : "stale"
}

interface ConnectionRow {
  connection_id: string
  status: string
  provider_account_name: string | null
  created_at: Date | string
  account_name: string | null
  currency_code: string | null
  time_zone: string | null
  shop_domain?: string | null
  [key: string]: unknown
}

interface SyncRunRow {
  connection_id: string
  status: string
  completed_at: Date | string | null
  started_at: Date | string | null
  error_code: string | null
  error_message: string | null
  [key: string]: unknown
  created_at: Date | string
}

type ProviderKey = "salla" | "shopify" | "zid"

const PROVIDER_CONFIG: Record<
  ProviderKey,
  {
    platform: StorePlatform
    connectionsTable: string
    storesTable: string
    recordsTable: string
    syncRunsTable: string
    hasShopDomain: boolean
  }
> = {
  salla: {
    platform: "Salla",
    connectionsTable: "salla_oauth_connections",
    storesTable: "salla_stores",
    recordsTable: "salla_records",
    syncRunsTable: "salla_sync_runs",
    hasShopDomain: false,
  },
  shopify: {
    platform: "Shopify",
    connectionsTable: "shopify_oauth_connections",
    storesTable: "shopify_stores",
    recordsTable: "shopify_records",
    syncRunsTable: "shopify_sync_runs",
    hasShopDomain: true,
  },
  zid: {
    platform: "Zid",
    connectionsTable: "zid_oauth_connections",
    storesTable: "zid_stores",
    recordsTable: "zid_records",
    syncRunsTable: "zid_sync_runs",
    hasShopDomain: false,
  },
}

export class StoresAggregationService {
  constructor(private readonly db: PostgresDatabase) {}

  async listStores(actor: AuthenticatedActor): Promise<StoreSummary[]> {
    const results = await Promise.all(
      (Object.keys(PROVIDER_CONFIG) as ProviderKey[]).map((provider) =>
        this.fetchProviderStores(provider, actor)
      )
    )

    return results.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private async fetchProviderStores(
    provider: ProviderKey,
    actor: AuthenticatedActor
  ): Promise<StoreSummary[]> {
    const config = PROVIDER_CONFIG[provider]

    // Plain LEFT JOIN to salla_stores only (no records join here) -- a three-way LEFT JOIN
    // across products/orders/customers would fan out into a cross product needing
    // count(DISTINCT ...) to undo, and pg-mem's aggregator crashes on count(DISTINCT ...)
    // (confirmed: "Cannot read properties of undefined" internal error). Record counts are
    // fetched as a separate grouped query below and merged in JS instead, avoiding both the
    // fan-out and the unsupported DISTINCT aggregate.
    const connectionsResult = await this.db.query<ConnectionRow>({
      name: `stores-aggregation-${provider}`,
      text: `
        SELECT
          c.id AS connection_id,
          c.status AS status,
          c.provider_account_name AS provider_account_name,
          c.created_at AS created_at,
          s.account_name AS account_name,
          s.currency_code AS currency_code,
          s.time_zone AS time_zone,
          ${config.hasShopDomain ? "c.shop_domain" : "null"} AS shop_domain
        FROM ${config.connectionsTable} c
        LEFT JOIN ${config.storesTable} s ON s.connection_id = c.id AND s.is_selected = true
        WHERE c.organization_id = $1
          AND c.deleted_at IS NULL
          AND ($2::uuid IS NULL OR c.workspace_id = $2::uuid)
        ORDER BY c.created_at DESC
      `,
      values: [actor.organizationId, actor.workspaceId ?? null],
    })

    if (connectionsResult.rows.length === 0) {
      return []
    }

    const connectionIds = connectionsResult.rows.map((row) => row.connection_id)
    // Explicit IN(...) placeholders rather than `= ANY($1::uuid[])` -- pg-mem doesn't reliably
    // bind a JS array parameter through ANY() (rows silently came back empty in testing), so
    // this is the portable form. The connection list here is small (a handful of store
    // connections per org), so the placeholder count is never a practical concern.
    const inPlaceholders = connectionIds.map((_, index) => `$${index + 1}`).join(", ")

    const recordCountsResult = await this.db.query<{
      connection_id: string
      entity_type: string
      cnt: string | number
    }>({
      name: `stores-aggregation-${provider}-record-counts-${connectionIds.length}`,
      text: `
        SELECT connection_id, entity_type, count(*) AS cnt
        FROM ${config.recordsTable}
        WHERE connection_id IN (${inPlaceholders})
        GROUP BY connection_id, entity_type
      `,
      values: connectionIds,
    })

    const countsByConnection = new Map<
      string,
      { products: number; orders: number; customers: number }
    >()
    for (const row of recordCountsResult.rows) {
      const existing = countsByConnection.get(row.connection_id) ?? {
        products: 0,
        orders: 0,
        customers: 0,
      }
      if (row.entity_type === "products") existing.products = Number(row.cnt) || 0
      if (row.entity_type === "orders") existing.orders = Number(row.cnt) || 0
      if (row.entity_type === "customers") existing.customers = Number(row.cnt) || 0
      countsByConnection.set(row.connection_id, existing)
    }

    const syncRunsResult = await this.db.query<SyncRunRow>({
      name: `stores-aggregation-${provider}-sync-runs-${connectionIds.length}`,
      text: `
        SELECT connection_id, status, completed_at, started_at, error_code, error_message, created_at
        FROM ${config.syncRunsTable}
        WHERE connection_id IN (${inPlaceholders})
        ORDER BY created_at DESC
      `,
      values: connectionIds,
    })

    const latestRunByConnection = new Map<string, SyncRunRow>()
    for (const run of syncRunsResult.rows) {
      if (!latestRunByConnection.has(run.connection_id)) {
        latestRunByConnection.set(run.connection_id, run)
      }
    }

    return connectionsResult.rows.map((row) => {
      const latestRun = latestRunByConnection.get(row.connection_id) ?? null
      const lastSyncAt = latestRun
        ? toIsoDate(latestRun.completed_at ?? latestRun.started_at ?? latestRun.created_at)
        : null
      const lastRunStatus = (latestRun?.status as StoreSyncRunStatus | undefined) ?? null
      const counts = countsByConnection.get(row.connection_id) ?? {
        products: 0,
        orders: 0,
        customers: 0,
      }

      return {
        id: `${provider}:${row.connection_id}`,
        name: row.account_name || row.provider_account_name || `${config.platform} store`,
        platform: config.platform,
        url: row.shop_domain ?? null,
        currency: row.currency_code ?? null,
        timeZone: row.time_zone ?? null,
        connectionStatus: row.status as StoreConnectionStatus,
        productCount: counts.products,
        orderCount: counts.orders,
        customerCount: counts.customers,
        lastSyncAt,
        lastSyncStatus: lastRunStatus,
        lastSyncError: latestRun?.error_message ?? null,
        syncHealth: computeSyncHealth({ lastRunStatus, lastSyncAt }),
        createdAt: toIsoDate(row.created_at),
      }
    })
  }
}
