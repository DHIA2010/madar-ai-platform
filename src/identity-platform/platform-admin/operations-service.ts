import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { requirePlatformAdmin } from "./guard"
import type { Page, PageRequest } from "./types"

// Every external platform customers connect, with the tables its connections and sync runs live
// in. Every provider shares the same column shapes for these two tables.
const PROVIDERS = [
  {
    key: "google_ads",
    category: "ads",
    connections: "google_oauth_connections",
    runs: "google_ads_sync_runs",
  },
  {
    key: "meta_ads",
    category: "ads",
    connections: "meta_oauth_connections",
    runs: "meta_sync_runs",
  },
  {
    key: "snapchat_ads",
    category: "ads",
    connections: "snapchat_oauth_connections",
    runs: "snapchat_sync_runs",
  },
  {
    key: "tiktok_ads",
    category: "ads",
    connections: "tiktok_ads_oauth_connections",
    runs: "tiktok_ads_sync_runs",
  },
  {
    key: "google_analytics",
    category: "analytics",
    connections: "google_analytics_oauth_connections",
    runs: "google_analytics_sync_runs",
  },
  {
    key: "salla",
    category: "ecommerce",
    connections: "salla_oauth_connections",
    runs: "salla_sync_runs",
  },
  {
    key: "zid",
    category: "ecommerce",
    connections: "zid_oauth_connections",
    runs: "zid_sync_runs",
  },
  {
    key: "shopify",
    category: "ecommerce",
    connections: "shopify_oauth_connections",
    runs: "shopify_sync_runs",
  },
] as const
type ProviderKey = (typeof PROVIDERS)[number]["key"]
const STORE_PLATFORMS = ["salla", "zid", "shopify"] as const
type StorePlatform = (typeof STORE_PLATFORMS)[number]

const DAY_MS = 24 * 60 * 60 * 1000

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function paginate<T>(rows: T[], page: PageRequest): Page<T> {
  const start = (page.page - 1) * page.pageSize
  return {
    items: rows.slice(start, start + page.pageSize),
    total: rows.length,
    page: page.page,
    pageSize: page.pageSize,
  }
}

export interface AdminStore {
  id: string
  platform: StorePlatform
  accountId: string
  accountName: string | null
  organizationId: string
  organizationName: string
  connectionStatus: string
  isSelected: boolean
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncError: string | null
}

export interface AdminProviderOverview {
  provider: ProviderKey
  category: "ads" | "analytics" | "ecommerce"
  total: number
  connected: number
  errored: number
  disconnected: number
  syncsLast24h: number
  failedSyncsLast24h: number
  lastSyncAt: string | null
}

export interface AdminFailedSync {
  provider: ProviderKey
  connectionId: string
  organizationId: string
  organizationName: string
  errorMessage: string | null
  failedAt: string
}

// Read-only, cross-customer views of what Madar is connected to and how it's running: stores,
// integrations, tracking volume, and system health. Platform-admin only.
export class PlatformOperationsService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly cacheHealthCheck: (() => Promise<boolean>) | null
  ) {}

  private async organizationNames(): Promise<Map<string, string>> {
    const result = await this.db.query<{ id: string; name: string }>(
      "SELECT id, name FROM organizations"
    )
    return new Map(result.rows.map((row) => [row.id, row.name]))
  }

  // ---- Stores ----

  private async loadStores(): Promise<AdminStore[]> {
    const names = await this.organizationNames()
    const stores: AdminStore[] = []
    for (const platform of STORE_PLATFORMS) {
      const rows = await this.db.query<Record<string, unknown>>(`
        SELECT s.id, s.account_id, s.account_name, s.is_selected, c.id AS connection_id,
               c.organization_id, c.status AS connection_status
          FROM ${platform}_stores s
          JOIN ${platform}_oauth_connections c ON c.id = s.connection_id
         WHERE c.deleted_at IS NULL
      `)
      const runs = await this.db.query<Record<string, unknown>>(`
        SELECT connection_id, status, error_message, completed_at, created_at
          FROM ${platform}_sync_runs
         ORDER BY created_at DESC
      `)
      const lastRun = new Map<string, Record<string, unknown>>()
      for (const run of runs.rows) {
        const connectionId = String(run.connection_id)
        if (!lastRun.has(connectionId)) lastRun.set(connectionId, run)
      }
      for (const row of rows.rows) {
        const run = lastRun.get(String(row.connection_id))
        stores.push({
          id: String(row.id),
          platform,
          accountId: String(row.account_id),
          accountName: (row.account_name as string | null) ?? null,
          organizationId: String(row.organization_id),
          organizationName: names.get(String(row.organization_id)) ?? "—",
          connectionStatus: String(row.connection_status),
          isSelected: row.is_selected === true,
          lastSyncAt: run ? toIso(run.completed_at ?? run.created_at) : null,
          lastSyncStatus: run ? String(run.status) : null,
          lastSyncError: run ? ((run.error_message as string | null) ?? null) : null,
        })
      }
    }
    return stores.sort((left, right) =>
      (right.lastSyncAt ?? "").localeCompare(left.lastSyncAt ?? "")
    )
  }

  async listStores(
    actor: AuthenticatedActor,
    filters: { search?: string; platform?: StorePlatform; status?: string },
    page: PageRequest
  ): Promise<Page<AdminStore>> {
    requirePlatformAdmin(actor)
    const search = filters.search?.trim().toLowerCase()
    const rows = (await this.loadStores()).filter((store) => {
      if (filters.platform && store.platform !== filters.platform) return false
      if (filters.status && store.connectionStatus !== filters.status) return false
      if (search) {
        const haystack = [store.accountName, store.accountId, store.organizationName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
    return paginate(rows, page)
  }

  async getStoreSummary(actor: AuthenticatedActor) {
    requirePlatformAdmin(actor)
    const stores = await this.loadStores()
    return {
      total: stores.length,
      connected: stores.filter((store) => store.connectionStatus === "connected").length,
      syncErrors: stores.filter((store) => store.lastSyncStatus === "failed").length,
      byPlatform: Object.fromEntries(
        STORE_PLATFORMS.map((platform) => [
          platform,
          stores.filter((store) => store.platform === platform).length,
        ])
      ) as Record<StorePlatform, number>,
    }
  }

  // ---- Integrations ----

  async getIntegrations(actor: AuthenticatedActor): Promise<{
    providers: AdminProviderOverview[]
    recentFailures: AdminFailedSync[]
  }> {
    requirePlatformAdmin(actor)
    const names = await this.organizationNames()
    const since = Date.now() - DAY_MS
    const providers: AdminProviderOverview[] = []
    const failures: AdminFailedSync[] = []

    for (const provider of PROVIDERS) {
      const connections = await this.db.query<{
        id: string
        organization_id: string
        status: string
      }>(`SELECT id, organization_id, status FROM ${provider.connections} WHERE deleted_at IS NULL`)
      const runs = await this.db.query<Record<string, unknown>>(
        `SELECT connection_id, organization_id, status, error_message, completed_at, created_at
           FROM ${provider.runs}
          ORDER BY created_at DESC
          LIMIT 500`
      )
      const recent = runs.rows.filter(
        (run) => new Date(String(toIso(run.created_at))).getTime() >= since
      )
      const count = (status: string) =>
        connections.rows.filter((row) => row.status === status).length
      providers.push({
        provider: provider.key,
        category: provider.category,
        total: connections.rows.length,
        connected: count("connected"),
        errored: count("error"),
        disconnected: count("disconnected"),
        syncsLast24h: recent.length,
        failedSyncsLast24h: recent.filter((run) => run.status === "failed").length,
        lastSyncAt: runs.rows[0]
          ? toIso(runs.rows[0].completed_at ?? runs.rows[0].created_at)
          : null,
      })
      for (const run of runs.rows.filter((entry) => entry.status === "failed").slice(0, 20)) {
        failures.push({
          provider: provider.key,
          connectionId: String(run.connection_id),
          organizationId: String(run.organization_id),
          organizationName: names.get(String(run.organization_id)) ?? "—",
          errorMessage: (run.error_message as string | null) ?? null,
          failedAt: toIso(run.completed_at ?? run.created_at) ?? "",
        })
      }
    }
    return {
      providers,
      recentFailures: failures
        .sort((left, right) => right.failedAt.localeCompare(left.failedAt))
        .slice(0, 30),
    }
  }

  // ---- Tracking & events ----

  async getTracking(actor: AuthenticatedActor) {
    requirePlatformAdmin(actor)
    const names = await this.organizationNames()
    const now = Date.now()
    // Midnight in Riyadh (UTC+3, no DST): shift to Riyadh time, floor to the day, shift back.
    const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000
    const startOfToday = new Date(
      Math.floor((now + RIYADH_OFFSET_MS) / DAY_MS) * DAY_MS - RIYADH_OFFSET_MS
    )
    const weekAgo = new Date(startOfToday.getTime() - 6 * DAY_MS)

    const events = await this.db.query<{
      organization_id: string
      event_type: string
      occurred_at: unknown
    }>(
      "SELECT organization_id, event_type, occurred_at FROM tracking_events WHERE occurred_at >= $1",
      [weekAgo.toISOString()]
    )
    const live = await this.db.query<{ organization_id: string }>(
      "SELECT organization_id FROM tracking_live_visitors WHERE last_seen_at >= $1",
      [new Date(now - 5 * 60 * 1000).toISOString()]
    )

    const days: Array<{ day: string; events: number; purchases: number }> = []
    for (let index = 0; index < 7; index += 1) {
      const start = weekAgo.getTime() + index * DAY_MS
      const inDay = events.rows.filter((row) => {
        const at = new Date(String(toIso(row.occurred_at))).getTime()
        return at >= start && at < start + DAY_MS
      })
      days.push({
        day: new Date(start + 3 * 60 * 60 * 1000).toISOString().slice(0, 10),
        events: inDay.length,
        purchases: inDay.filter((row) => row.event_type === "PURCHASE").length,
      })
    }
    const today = events.rows.filter(
      (row) => new Date(String(toIso(row.occurred_at))).getTime() >= startOfToday.getTime()
    )
    const byType: Record<string, number> = {}
    const byOrg = new Map<string, number>()
    for (const row of today) {
      byType[row.event_type] = (byType[row.event_type] ?? 0) + 1
      byOrg.set(row.organization_id, (byOrg.get(row.organization_id) ?? 0) + 1)
    }
    return {
      eventsToday: today.length,
      purchasesToday: byType.PURCHASE ?? 0,
      liveVisitorsNow: live.rows.length,
      trackingCustomersToday: byOrg.size,
      eventsByTypeToday: byType,
      last7Days: days,
      topCustomersToday: [...byOrg.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 10)
        .map(([organizationId, count]) => ({
          organizationId,
          organizationName: names.get(organizationId) ?? "—",
          events: count,
        })),
    }
  }

  // ---- System health ----

  async getSystemHealth(actor: AuthenticatedActor) {
    requirePlatformAdmin(actor)
    const dbStart = Date.now()
    let databaseOk = true
    try {
      await this.db.query("SELECT 1")
    } catch {
      databaseOk = false
    }
    const databaseLatencyMs = Date.now() - dbStart
    let cacheOk: boolean | null = null
    if (this.cacheHealthCheck) {
      cacheOk = await this.cacheHealthCheck().catch(() => false)
    }

    const outbox = await this.db.query<{ status: string; total: unknown; oldest: unknown }>(
      "SELECT status, COUNT(*) AS total, MIN(created_at) AS oldest FROM outbox_events GROUP BY status"
    )
    const pending = outbox.rows.find((row) => row.status === "pending")
    const failedAlerts = await this.db.query<{ total: unknown }>(
      "SELECT COUNT(*) AS total FROM schedule_failure_alerts WHERE created_at >= $1",
      [new Date(Date.now() - 7 * DAY_MS).toISOString()]
    )

    const since = new Date(Date.now() - DAY_MS).toISOString()
    const syncs: Array<{
      provider: ProviderKey
      total: number
      failed: number
      successRate: number | null
    }> = []
    for (const provider of PROVIDERS) {
      const result = await this.db.query<{ status: string; total: unknown }>(
        `SELECT status, COUNT(*) AS total FROM ${provider.runs} WHERE created_at >= $1 GROUP BY status`,
        [since]
      )
      const total = result.rows.reduce((sum, row) => sum + Number(row.total), 0)
      const failed = Number(result.rows.find((row) => row.status === "failed")?.total ?? 0)
      syncs.push({
        provider: provider.key,
        total,
        failed,
        successRate: total === 0 ? null : Math.round(((total - failed) / total) * 100),
      })
    }

    const memory = process.memoryUsage()
    return {
      checkedAt: new Date().toISOString(),
      database: { ok: databaseOk, latencyMs: databaseLatencyMs },
      cache: { ok: cacheOk },
      server: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(memory.rss / 1024 / 1024),
        nodeVersion: process.version,
        version: process.env.APP_VERSION ?? process.env.IMAGE_TAG ?? null,
      },
      outbox: {
        pending: Number(pending?.total ?? 0),
        oldestPendingAt: pending ? toIso(pending.oldest) : null,
        failed: Number(outbox.rows.find((row) => row.status === "failed")?.total ?? 0),
      },
      scheduleFailuresLast7Days: Number(failedAlerts.rows[0]?.total ?? 0),
      syncsLast24h: syncs,
    }
  }
}
