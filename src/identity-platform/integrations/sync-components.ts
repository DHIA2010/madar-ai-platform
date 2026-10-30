import type { PostgresDatabase } from "../infrastructure/postgres/database"

// The data an e-commerce connection syncs. Each store's sync run and webhook handler skips the
// components a merchant turned off (see identity-platform/migrations/124_integration_sync_components.sql).
export const SYNC_COMPONENTS = ["products", "orders", "customers"] as const
export type SyncComponent = (typeof SYNC_COMPONENTS)[number]
export type SyncComponentSettings = Record<SyncComponent, boolean>

export const ECOMMERCE_SYNC_PROVIDERS = ["salla", "zid", "shopify"] as const
export type EcommerceSyncProvider = (typeof ECOMMERCE_SYNC_PROVIDERS)[number]

const CONNECTIONS_TABLE: Record<EcommerceSyncProvider, string> = {
  salla: "salla_oauth_connections",
  zid: "zid_oauth_connections",
  shopify: "shopify_oauth_connections",
}

const ALL_ON: SyncComponentSettings = { products: true, orders: true, customers: true }

export async function loadSyncComponents(
  db: PostgresDatabase,
  provider: EcommerceSyncProvider,
  connectionId: string
): Promise<SyncComponentSettings> {
  const result = await db.query<SyncComponentSettings>(
    `SELECT products, orders, customers FROM integration_sync_components
      WHERE provider = $1 AND connection_id = $2`,
    [provider, connectionId]
  )
  const row = result.rows[0]
  return row
    ? {
        products: Boolean(row.products),
        orders: Boolean(row.orders),
        customers: Boolean(row.customers),
      }
    : { ...ALL_ON }
}

export async function saveSyncComponents(
  db: PostgresDatabase,
  input: {
    provider: EcommerceSyncProvider
    connectionId: string
    settings: SyncComponentSettings
    userId: string | null
  }
): Promise<void> {
  await db.query(
    `INSERT INTO integration_sync_components
       (provider, connection_id, products, orders, customers, updated_by_user_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (provider, connection_id) DO UPDATE SET
       products = EXCLUDED.products,
       orders = EXCLUDED.orders,
       customers = EXCLUDED.customers,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()`,
    [
      input.provider,
      input.connectionId,
      input.settings.products,
      input.settings.orders,
      input.settings.customers,
      input.userId,
    ]
  )
}

// Whether this organization owns the connection -- the settings routes are org-scoped.
export async function connectionBelongsToOrganization(
  db: PostgresDatabase,
  provider: EcommerceSyncProvider,
  connectionId: string,
  organizationId: string
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM ${CONNECTIONS_TABLE[provider]} WHERE id = $1 AND organization_id = $2`,
    [connectionId, organizationId]
  )
  return result.rows.length > 0
}
