import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { summarizeStoreOrder } from "../orders/service"

import { notify } from "./service"

type StorePlatform = "salla" | "zid" | "shopify"

const RECORDS_TABLE: Record<StorePlatform, string> = {
  salla: "salla_records",
  zid: "zid_records",
  shopify: "shopify_records",
}
const CONNECTIONS_TABLE: Record<StorePlatform, string> = {
  salla: "salla_oauth_connections",
  zid: "zid_oauth_connections",
  shopify: "shopify_oauth_connections",
}

// Only orders placed recently are "new": connecting a store imports its whole history, which must
// not ring the bell for every old order.
const RECENT_MS = 2 * 24 * 60 * 60 * 1000
// More new orders than this in one sync become a single "N new orders" notification.
const MAX_INDIVIDUAL = 3

interface SyncedRecord {
  entityType: string
  entityId: string
  payload: Record<string, unknown>
}

// The orders in a sync batch that this connection hasn't stored yet. Call before saving the batch.
export async function findUnseenOrders(
  db: PostgresDatabase,
  platform: StorePlatform,
  connectionId: string,
  records: SyncedRecord[]
): Promise<SyncedRecord[]> {
  const orders = records.filter((record) => record.entityType === "orders")
  if (orders.length === 0) return []
  try {
    const existing = await db.query<{ entity_id: string }>(
      `SELECT entity_id FROM ${RECORDS_TABLE[platform]}
        WHERE connection_id = $1 AND entity_type = 'orders' AND entity_id = ANY($2::text[])`,
      [connectionId, orders.map((order) => order.entityId)]
    )
    const seen = new Set(existing.rows.map((row) => String(row.entity_id)))
    return orders.filter((order) => !seen.has(order.entityId))
  } catch (error) {
    console.error("notifications.find_unseen_orders_failed", { platform, error })
    return []
  }
}

// Announces orders the store just sent that were placed recently: one notification each, or one
// summary when there are many.
export async function announceNewStoreOrders(
  db: PostgresDatabase,
  platform: StorePlatform,
  connectionId: string,
  unseen: SyncedRecord[]
): Promise<void> {
  if (unseen.length === 0) return
  try {
    const now = Date.now()
    const recent = unseen
      .map((record) => ({
        entityId: record.entityId,
        order: summarizeStoreOrder(platform, record.entityId, record.payload),
      }))
      .filter(({ order }) => now - new Date(order.createdAt).getTime() <= RECENT_MS)
    if (recent.length === 0) return

    const connection = await db.query<{ organization_id: string }>(
      `SELECT organization_id FROM ${CONNECTIONS_TABLE[platform]} WHERE id = $1`,
      [connectionId]
    )
    const organizationId = connection.rows[0]?.organization_id
    if (!organizationId) return

    if (recent.length > MAX_INDIVIDUAL) {
      await notify(db, {
        organizationId,
        type: "orders_new_batch",
        audience: "orders:view",
        params: { platform, count: recent.length },
        link: "/orders",
      })
      return
    }
    for (const { entityId, order } of recent) {
      await notify(db, {
        organizationId,
        type: "order_new",
        audience: "orders:view",
        params: {
          platform,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          amount: order.amount,
          currency: order.currency,
        },
        link: "/orders",
        dedupeKey: `order:${platform}:${connectionId}:${entityId}`,
      })
    }
  } catch (error) {
    console.error("notifications.announce_orders_failed", { platform, error })
  }
}
