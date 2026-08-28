import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export type OrderPlatform = "Salla" | "Shopify" | "Zid"
// Bucketed from each provider's own real status text (see bucketOrderStatus) -- not a field
// any provider syncs directly, since each has its own status vocabulary.
export type OrderStatusBucket = "Completed" | "Processing" | "Cancelled" | "Refunded"
export type PaymentStatus = "Paid" | "Refunded" | "Pending"

export interface OrderItemView {
  name: string
  quantity: number
  // Only Salla's real order payload carries a per-item image (verified against live data);
  // Shopify/Zid's line-item shapes have no equivalent field confirmed, so this stays undefined
  // for them rather than guessing a field name.
  thumbnail?: string
}

export interface OrderSummaryView {
  id: string
  orderNumber: string
  customerName: string
  channel: string
  platform: OrderPlatform
  items: OrderItemView[]
  productCount: number
  amount: number
  currency: string
  orderStatus: OrderStatusBucket
  paymentStatus: PaymentStatus
  createdAt: string
}

export interface OrdersSummaryStats {
  totalOrders: number
  totalOrdersChangePct: number | null
  totalSales: number
  totalSalesChangePct: number | null
  averageOrderValue: number
  averageOrderValueChangePct: number | null
  completedOrders: number
  completedOrdersChangePct: number | null
  processingOrders: number
  cancelledOrders: number
}

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

// Real status text varies per provider (Salla: Arabic names like "بإنتظار المراجعة"/slugs like
// "under_review"; Shopify: fulfillment_status/cancelled_at; Zid: order_status.name/code) --
// bucketing by substring match on whichever real text/slug/code each provider actually returns
// is what lets one shared display bucket work across all three without needing to enumerate
// every provider's exact status vocabulary (which isn't fully documented for any of them).
function bucketOrderStatus(rawText: string): OrderStatusBucket {
  const text = rawText.toLowerCase()
  if (text.includes("cancel") || text.includes("الغ")) {
    return "Cancelled"
  }
  if (text.includes("refund") || text.includes("مسترد") || text.includes("استرجاع")) {
    return "Refunded"
  }
  if (
    text.includes("complet") ||
    text.includes("deliver") ||
    text.includes("fulfilled") ||
    text.includes("مكتمل") ||
    text.includes("تسليم")
  ) {
    return "Completed"
  }
  return "Processing"
}

interface OrderRecordRow {
  entity_id: string
  payload: Record<string, unknown>
  updated_at: Date | string
  [key: string]: unknown
}

// Confirmed against a real synced Salla order payload (stage: salla_records, entity_type
// 'orders'): total/paid_amount/refund_amount are all {amount,currency} objects, source is
// Salla's own order channel (e.g. "devportal", not marketing attribution -- there's no
// UTM/campaign field anywhere on the order), items[] have name+quantity but no price.
function normalizeSallaOrder(row: OrderRecordRow): OrderSummaryView {
  const payload = row.payload as {
    reference_id?: number | string
    customer?: { full_name?: string; first_name?: string; last_name?: string }
    source?: string
    total?: { amount?: number; currency?: string }
    status?: { name?: string; slug?: string }
    is_pending_payment?: boolean
    payment_actions?: { refund_action?: { has_refund_amount?: boolean } }
    items?: Array<{ name?: string; quantity?: number; thumbnail?: string }>
    date?: { date?: string }
  }

  const items = (payload.items ?? []).map((item) => ({
    name: item.name ?? "",
    quantity: Number(item.quantity) || 0,
    thumbnail: item.thumbnail || undefined,
  }))
  const statusText = payload.status?.name ?? payload.status?.slug ?? ""

  const paymentStatus: PaymentStatus = payload.is_pending_payment
    ? "Pending"
    : payload.payment_actions?.refund_action?.has_refund_amount
      ? "Refunded"
      : "Paid"

  return {
    id: `salla:${row.entity_id}`,
    orderNumber: String(payload.reference_id ?? row.entity_id),
    customerName:
      payload.customer?.full_name ||
      [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") ||
      "Unknown customer",
    channel: payload.source || "unknown",
    platform: "Salla",
    items,
    productCount: items.reduce((sum, item) => sum + item.quantity, 0),
    amount: Number(payload.total?.amount) || 0,
    currency: payload.total?.currency ?? "SAR",
    orderStatus: bucketOrderStatus(statusText),
    paymentStatus,
    createdAt: payload.date?.date ? toIsoDate(payload.date.date) : toIsoDate(row.updated_at),
  }
}

// Standard Shopify Order REST shape (not yet verified against live data -- no Shopify orders
// synced in this environment): financial_status is Shopify's own payment-state enum
// (paid/pending/refunded/partially_refunded/voided/authorized), fulfillment_status plus
// cancelled_at together stand in for order-level status since Shopify has no single combined
// field, and there's no UTM/campaign field on the order object either -- source_name reflects
// the storefront/API channel (web/pos/etc), the same "real channel, not marketing attribution"
// shape as Salla's source.
function normalizeShopifyOrder(row: OrderRecordRow): OrderSummaryView {
  const payload = row.payload as {
    order_number?: number | string
    customer?: { first_name?: string; last_name?: string }
    source_name?: string
    total_price?: string
    currency?: string
    financial_status?: string
    fulfillment_status?: string | null
    cancelled_at?: string | null
    line_items?: Array<{ name?: string; quantity?: number }>
    created_at?: string
  }

  const items = (payload.line_items ?? []).map((item) => ({
    name: item.name ?? "",
    quantity: Number(item.quantity) || 0,
  }))

  const orderStatus: OrderStatusBucket = payload.cancelled_at
    ? "Cancelled"
    : bucketOrderStatus(payload.fulfillment_status ?? "processing")

  const paymentStatus: PaymentStatus =
    payload.financial_status === "paid"
      ? "Paid"
      : payload.financial_status === "refunded" || payload.financial_status === "partially_refunded"
        ? "Refunded"
        : payload.financial_status === "voided"
          ? "Refunded"
          : "Pending"

  return {
    id: `shopify:${row.entity_id}`,
    orderNumber: String(payload.order_number ?? row.entity_id),
    customerName:
      [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") ||
      "Unknown customer",
    channel: payload.source_name || "unknown",
    platform: "Shopify",
    items,
    productCount: items.reduce((sum, item) => sum + item.quantity, 0),
    amount: Number(payload.total_price) || 0,
    currency: payload.currency ?? "SAR",
    orderStatus,
    paymentStatus,
    createdAt: payload.created_at ? toIsoDate(payload.created_at) : toIsoDate(row.updated_at),
  }
}

// Confirmed against Zid's official docs (docs.zid.sa/list-of-orders): order_total is a numeric
// string, order_status is {name, code}, customer is {id, name, ...}. Payment status is not a
// documented distinct field, so it's inferred from order_status text the same way order status
// itself is bucketed -- flagged as unverified against live Zid data (no Zid store connected in
// this environment).
function normalizeZidOrder(row: OrderRecordRow): OrderSummaryView {
  const payload = row.payload as {
    code?: string
    customer?: { name?: string }
    order_total?: string
    currency_code?: string
    order_status?: { name?: string; code?: string }
    created_at?: string
  }

  const statusText = payload.order_status?.name ?? payload.order_status?.code ?? ""
  const paymentStatus: PaymentStatus = statusText.toLowerCase().includes("refund")
    ? "Refunded"
    : "Paid"

  return {
    id: `zid:${row.entity_id}`,
    orderNumber: payload.code ?? row.entity_id,
    customerName: payload.customer?.name || "Unknown customer",
    channel: "zid",
    platform: "Zid",
    items: [],
    productCount: 0,
    amount: Number(payload.order_total) || 0,
    currency: payload.currency_code ?? "SAR",
    orderStatus: bucketOrderStatus(statusText),
    paymentStatus,
    createdAt: payload.created_at ? toIsoDate(payload.created_at) : toIsoDate(row.updated_at),
  }
}

type ProviderKey = "salla" | "shopify" | "zid"

const PROVIDER_CONFIG: Record<
  ProviderKey,
  {
    recordsTable: string
    connectionsTable: string
    normalize: (row: OrderRecordRow) => OrderSummaryView
  }
> = {
  salla: {
    recordsTable: "salla_records",
    connectionsTable: "salla_oauth_connections",
    normalize: normalizeSallaOrder,
  },
  shopify: {
    recordsTable: "shopify_records",
    connectionsTable: "shopify_oauth_connections",
    normalize: normalizeShopifyOrder,
  },
  zid: {
    recordsTable: "zid_records",
    connectionsTable: "zid_oauth_connections",
    normalize: normalizeZidOrder,
  },
}

const MAX_ORDERS_PER_PROVIDER = 2000
const DEFAULT_WINDOW_DAYS = 30

function computeChangePct(current: number, previous: number): number | null {
  if (previous === 0) {
    return null
  }
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export interface OrdersQuery {
  startDate?: string
  endDate?: string
}

export interface OrdersListResult {
  items: OrderSummaryView[]
  summary: OrdersSummaryStats
}

export interface OrderConnectionRef {
  platform: ProviderKey
  connectionId: string
  entityId: string
}

export class OrdersAggregationService {
  constructor(private readonly db: PostgresDatabase) {}

  // Resolves the owning connection for a single order id ("salla:1155952133") so a caller
  // (the live order-detail endpoint) can look up the right OAuth connection/access token --
  // scoped by org/workspace the same way every other lookup in this service is.
  async resolveOrderConnection(
    actor: AuthenticatedActor,
    orderId: string
  ): Promise<OrderConnectionRef | null> {
    const [provider, entityId] = orderId.split(":", 2)
    if (!provider || !entityId || !(provider in PROVIDER_CONFIG)) {
      return null
    }

    const config = PROVIDER_CONFIG[provider as ProviderKey]
    const result = await this.db.query<{ connection_id: string }>({
      name: `orders-resolve-connection-${provider}`,
      text: `
        SELECT o.connection_id
        FROM ${config.recordsTable} o
        JOIN ${config.connectionsTable} c ON c.id = o.connection_id
        WHERE o.entity_type = 'orders'
          AND o.entity_id = $1
          AND c.organization_id = $2
          AND c.deleted_at IS NULL
          AND c.status = 'connected'
          AND ($3::uuid IS NULL OR c.workspace_id = $3::uuid)
        LIMIT 1
      `,
      values: [entityId, actor.organizationId, actor.workspaceId ?? null],
    })

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return { platform: provider as ProviderKey, connectionId: row.connection_id, entityId }
  }

  async listOrders(actor: AuthenticatedActor, query: OrdersQuery): Promise<OrdersListResult> {
    const endDate = query.endDate ? new Date(query.endDate) : new Date()
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const periodMs = endDate.getTime() - startDate.getTime()
    const previousStart = new Date(startDate.getTime() - periodMs)
    const previousEnd = new Date(startDate.getTime() - 1)

    const [currentRows, previousRows] = await Promise.all([
      this.fetchOrderRows(actor, startDate, endDate),
      this.fetchOrderRows(actor, previousStart, previousEnd),
    ])

    const items = currentRows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const summary = this.buildSummary(items, previousRows)

    return { items, summary }
  }

  private async fetchOrderRows(
    actor: AuthenticatedActor,
    start: Date,
    end: Date
  ): Promise<OrderSummaryView[]> {
    const results = await Promise.all(
      (Object.keys(PROVIDER_CONFIG) as ProviderKey[]).map(async (provider) => {
        const config = PROVIDER_CONFIG[provider]
        const result = await this.db.query<OrderRecordRow>({
          name: `orders-aggregation-${provider}`,
          text: `
            SELECT o.entity_id, o.payload, o.updated_at
            FROM ${config.recordsTable} o
            JOIN ${config.connectionsTable} c ON c.id = o.connection_id
            WHERE o.entity_type = 'orders'
              AND c.organization_id = $1
              AND c.deleted_at IS NULL
              AND c.status = 'connected'
              AND ($2::uuid IS NULL OR c.workspace_id = $2::uuid)
              AND o.record_date >= $3::date
              AND o.record_date <= $4::date
            ORDER BY o.updated_at DESC
            LIMIT $5
          `,
          values: [
            actor.organizationId,
            actor.workspaceId ?? null,
            start.toISOString().slice(0, 10),
            end.toISOString().slice(0, 10),
            MAX_ORDERS_PER_PROVIDER,
          ],
        })
        return result.rows.map(config.normalize)
      })
    )

    return results.flat()
  }

  private buildSummary(
    current: OrderSummaryView[],
    previous: OrderSummaryView[]
  ): OrdersSummaryStats {
    const currentSales = current.reduce((sum, o) => sum + o.amount, 0)
    const previousSales = previous.reduce((sum, o) => sum + o.amount, 0)
    const currentCompleted = current.filter((o) => o.orderStatus === "Completed").length
    const previousCompleted = previous.filter((o) => o.orderStatus === "Completed").length
    const currentAov = current.length > 0 ? currentSales / current.length : 0
    const previousAov = previous.length > 0 ? previousSales / previous.length : 0

    return {
      totalOrders: current.length,
      totalOrdersChangePct: computeChangePct(current.length, previous.length),
      totalSales: currentSales,
      totalSalesChangePct: computeChangePct(currentSales, previousSales),
      averageOrderValue: currentAov,
      averageOrderValueChangePct: computeChangePct(currentAov, previousAov),
      completedOrders: currentCompleted,
      completedOrdersChangePct: computeChangePct(currentCompleted, previousCompleted),
      processingOrders: current.filter((o) => o.orderStatus === "Processing").length,
      cancelledOrders: current.filter((o) => o.orderStatus === "Cancelled").length,
    }
  }
}
