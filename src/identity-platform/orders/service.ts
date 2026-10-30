import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { decomposeRevenueChange, type RevenueDecomposition } from "../shared/analytics-rules"

// Genie-level audit finding: e-commerce had no confidence computation at all --
// driverFindingsFromOrdersDecomposition (ai-chat/response-formatter.ts) hardcoded "medium"
// regardless of actual order volume. Same sample-size bands as pos/sales-analytics-engine.ts's
// PosConfidenceLevel (orders are the equivalent sample unit to POS invoices), kept local here
// rather than importing across domains -- the same duplication precedent that file's own comment
// documents (APPLICATION_SETTINGS_KEY, confidence-engine.ts vs. PosConfidenceLevel).
export type OrdersConfidenceLevel = "high" | "medium" | "low" | "insufficient"

interface OrdersSampleSize {
  orders: number
  days: number
}

const ORDERS_CONFIDENCE_THRESHOLDS = {
  high: { minOrders: 20, minDays: 7 },
  medium: { minOrders: 5, minDays: 3 },
  low: { minOrders: 1, minDays: 1 },
} as const

function computeOrdersConfidence(sample: OrdersSampleSize): OrdersConfidenceLevel {
  if (
    sample.orders >= ORDERS_CONFIDENCE_THRESHOLDS.high.minOrders &&
    sample.days >= ORDERS_CONFIDENCE_THRESHOLDS.high.minDays
  )
    return "high"
  if (
    sample.orders >= ORDERS_CONFIDENCE_THRESHOLDS.medium.minOrders &&
    sample.days >= ORDERS_CONFIDENCE_THRESHOLDS.medium.minDays
  )
    return "medium"
  if (
    sample.orders >= ORDERS_CONFIDENCE_THRESHOLDS.low.minOrders &&
    sample.days >= ORDERS_CONFIDENCE_THRESHOLDS.low.minDays
  )
    return "low"
  return "insufficient"
}

function combineOrdersConfidence(
  a: OrdersConfidenceLevel,
  b: OrdersConfidenceLevel
): OrdersConfidenceLevel {
  const order: OrdersConfidenceLevel[] = ["insufficient", "low", "medium", "high"]
  return order[Math.min(order.indexOf(a), order.indexOf(b))]
}

function daysBetweenDates(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1)
}

export type OrderPlatform = "Salla" | "Shopify" | "Zid" | "Madar"
// Bucketed from each provider's own real status text (see bucketOrderStatus) -- not a field
// any provider syncs directly, since each has its own status vocabulary.
export type OrderStatusBucket = "Completed" | "Processing" | "Cancelled" | "Refunded"
export type PaymentStatus = "Paid" | "Refunded" | "Pending"

export interface OrderItemView {
  name: string
  quantity: number
  // Salla's items and Zid's products both carry an image (verified against live data);
  // Shopify's line-item shape has no equivalent field confirmed, so it stays undefined there.
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
  // The provider's own exact status text/name (e.g. Salla's merchant-facing status, which can be
  // a merchant-customized name, not just one of the 4 default ones orderStatus buckets into).
  // orderStatus stays bucketed because stats/filtering/AI-chat formatting (see usages below and
  // in ai-chat/response-formatter.ts) need a small, fixed vocabulary; this is purely for display.
  statusLabel: string
  paymentStatus: PaymentStatus
  createdAt: string
  // Only ever set for platform === "Madar" -- whether this order has been pushed to the
  // merchant's connected Salla store yet (see MadarOrdersService/SallaOrderPushService).
  // undefined for every synced provider, which never has a push concept of its own.
  sallaPushStatus?: "not_applicable" | "pending" | "pushed" | "failed"
  // Only ever set for platform === "Zid" today -- read from the order's own marketing_source
  // field (docs.zid.sa's MarketingChannelSource_Order schema; see normalizeZidOrder below).
  // Salla doesn't have a confirmed equivalent field yet (see attribution/repository.ts's
  // extractGenericSignals comment), so this stays undefined for every other provider rather than
  // guessing. undefined (not an all-null object) when the order simply has no marketing_source.
  marketingSource?: {
    medium: string | null
    campaign: string | null
    source: string | null
    device: string | null
  }
}

export interface OrdersSummaryStats {
  totalOrders: number
  totalOrdersChangePct: number | null
  previousTotalOrders: number
  totalSales: number
  totalSalesChangePct: number | null
  previousTotalSales: number
  averageOrderValue: number
  averageOrderValueChangePct: number | null
  previousAverageOrderValue: number
  completedOrders: number
  completedOrdersChangePct: number | null
  processingOrders: number
  processingOrdersChangePct: number | null
  cancelledOrders: number
  cancelledOrdersChangePct: number | null
  // Analysis Orchestration audit (Genie-upgrade, round 2) section 4: e-commerce had the raw
  // before/after numbers (above) but never decomposed WHY sales moved into order-volume vs.
  // average-order-value effect -- the same decomposeRevenueChange POS already uses for exactly
  // this question, reused here rather than re-implemented.
  decomposition: RevenueDecomposition
  confidence: OrdersConfidenceLevel
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

// Confirmed against real synced Salla order payloads (stage: salla_records, entity_type
// 'orders'), which come in two shapes: the GET /orders list shape (poll sync) has total and
// items[] (name+quantity, no price); the GET /orders/{id} shape (webhook re-fetch) has the total
// under amounts.total and no items -- the webhook adds them from GET /orders/items. The channel is
// always "salla": the order's own `source` is where inside Salla it was placed
// ("merchant-dashboard", "web", ...), not which platform it came from.
function normalizeSallaOrder(row: OrderRecordRow): OrderSummaryView {
  const payload = row.payload as {
    reference_id?: number | string
    customer?: { full_name?: string; first_name?: string; last_name?: string }
    source?: string
    total?: { amount?: number; currency?: string }
    amounts?: { total?: { amount?: number; currency?: string } }
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
    channel: "salla",
    platform: "Salla",
    items,
    productCount: items.reduce((sum, item) => sum + item.quantity, 0),
    amount: Number(payload.total?.amount ?? payload.amounts?.total?.amount) || 0,
    currency: payload.total?.currency ?? payload.amounts?.total?.currency ?? "SAR",
    orderStatus: bucketOrderStatus(statusText),
    statusLabel: statusText || bucketOrderStatus(statusText),
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

  const rawStatusText = payload.cancelled_at
    ? "cancelled"
    : (payload.fulfillment_status ?? "processing")
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
    statusLabel: rawStatusText,
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
    products?: Array<{
      name?: string
      quantity?: number | string
      images?: Array<{ thumbs?: { small?: string }; origin?: string }>
    }>
    // MarketingChannelSource_Order ("Marketing source details captured for the order"),
    // docs.zid.sa -- field names are doc-confirmed, population on a live order is not yet
    // verified (see attribution/repository.ts's extractZidSignals for the same caveat).
    marketing_source?: {
      utm_medium?: string
      utm_campaign?: string
      utm_source?: string
      device_type?: string
    }
  }

  const items = (payload.products ?? []).map((product) => ({
    name: product.name ?? "",
    quantity: Number(product.quantity) || 0,
    thumbnail: product.images?.[0]?.thumbs?.small || product.images?.[0]?.origin || undefined,
  }))
  const statusText = payload.order_status?.name ?? payload.order_status?.code ?? ""
  const paymentStatus: PaymentStatus = statusText.toLowerCase().includes("refund")
    ? "Refunded"
    : "Paid"

  const marketingSource = payload.marketing_source
  const hasMarketingSource = Boolean(
    marketingSource &&
    (marketingSource.utm_medium ||
      marketingSource.utm_campaign ||
      marketingSource.utm_source ||
      marketingSource.device_type)
  )

  return {
    id: `zid:${row.entity_id}`,
    orderNumber: payload.code ?? row.entity_id,
    customerName: payload.customer?.name || "Unknown customer",
    channel: "zid",
    platform: "Zid",
    items,
    productCount: items.reduce((sum, item) => sum + item.quantity, 0),
    amount: Number(payload.order_total) || 0,
    currency: payload.currency_code ?? "SAR",
    orderStatus: bucketOrderStatus(statusText),
    statusLabel: statusText || bucketOrderStatus(statusText),
    marketingSource: hasMarketingSource
      ? {
          medium: marketingSource?.utm_medium ?? null,
          campaign: marketingSource?.utm_campaign ?? null,
          source: marketingSource?.utm_source ?? null,
          device: marketingSource?.device_type ?? null,
        }
      : undefined,
    paymentStatus,
    createdAt: payload.created_at ? toIsoDate(payload.created_at) : toIsoDate(row.updated_at),
  }
}

// A Madar-created order (madar_orders) -- unlike the three synced providers, this never goes
// through a connection-joined records table (see fetchMadarOrderRows), so its row shape is its
// own, not an OrderRecordRow payload blob. status is already one of this bucket's own values
// ('processing'/'completed'/'cancelled'/'refunded'), so no text-sniffing via bucketOrderStatus
// is needed the way the three synced providers require.
interface MadarOrderAggregateRow {
  id: string
  order_number: string
  customer_name: string
  status: string
  payment_status: string
  total_amount: string | number
  currency: string
  created_at: Date | string
  salla_push_status: string
  [key: string]: unknown
}

function normalizeMadarOrder(
  row: MadarOrderAggregateRow,
  items: Array<{ name: string; quantity: number }>
): OrderSummaryView {
  const paymentStatus: PaymentStatus =
    row.payment_status === "paid"
      ? "Paid"
      : row.payment_status === "refunded"
        ? "Refunded"
        : "Pending"
  const orderStatusByStatus: Record<string, OrderStatusBucket> = {
    processing: "Processing",
    completed: "Completed",
    cancelled: "Cancelled",
    refunded: "Refunded",
  }

  return {
    id: `madar:${row.id}`,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    channel: "madar",
    platform: "Madar",
    items,
    productCount: items.reduce((sum, item) => sum + item.quantity, 0),
    amount: Number(row.total_amount) || 0,
    currency: row.currency,
    orderStatus: orderStatusByStatus[row.status] ?? "Processing",
    statusLabel: orderStatusByStatus[row.status] ?? "Processing",
    paymentStatus,
    createdAt: toIsoDate(row.created_at),
    sallaPushStatus: row.salla_push_status as OrderSummaryView["sallaPushStatus"],
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

// Per-connection (not per-platform) sales/orders -- unlike channels-service.ts's
// StorePlatformRow, which deliberately sums every connected store of the same platform into one
// row, this keeps each real store connection distinct, so a home-dashboard "sales by store" donut
// can show e.g. two separate Salla stores as two slices, not one merged "Salla" slice. Madar
// orders are never included here -- they have no store connection to attribute to.
export interface StoreSalesRow {
  connectionId: string
  platform: OrderPlatform
  totalSales: number
  totalSalesChangePct: number | null
  orderCount: number
  orderCountChangePct: number | null
  averageOrderValue: number
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

  // Backs the "all time" period: the real earliest/latest order date actually present across
  // every connected store, never an assumed "since the store opened" date. Reads MIN(date_start)/
  // MAX(date_end) from each provider's own sync_runs bookkeeping table (salla_sync_runs /
  // shopify_sync_runs / zid_sync_runs) rather than scanning fetchOrderRows: that query caps at
  // MAX_ORDERS_PER_PROVIDER rows ordered by most-recently-updated, so for a store with more
  // orders than the cap it would silently truncate away the true oldest order and report a too-
  // recent "earliest" date. Every provider's sync_runs table shares the same shape (organization_
  // id, workspace_id, date_start, date_end, status) for exactly this reason.
  async getDateCoverage(
    actor: AuthenticatedActor
  ): Promise<{ earliestDate: string | null; latestDate: string | null }> {
    const tables = ["salla_sync_runs", "shopify_sync_runs", "zid_sync_runs"]
    const [providerResults, madarResult] = await Promise.all([
      Promise.all(
        tables.map((table) =>
          this.db.query<{ earliest: string | null; latest: string | null }>(
            `SELECT min(date_start) AS earliest, max(date_end) AS latest
             FROM ${table}
             WHERE organization_id = $1 AND status = 'completed'
               AND ($2::uuid IS NULL OR workspace_id = $2::uuid)`,
            [actor.organizationId, actor.workspaceId]
          )
        )
      ),
      // Madar orders have no sync_runs bookkeeping -- they're never synced, just created -- so
      // this reads straight off the table's own created_at instead, no status filter needed.
      this.db.query<{ earliest: string | null; latest: string | null }>(
        `SELECT min(created_at) AS earliest, max(created_at) AS latest
         FROM madar_orders
         WHERE organization_id = $1 AND ($2::uuid IS NULL OR workspace_id = $2::uuid)`,
        [actor.organizationId, actor.workspaceId]
      ),
    ])

    let earliest: string | null = null
    let latest: string | null = null
    for (const result of [...providerResults, madarResult]) {
      const row = result.rows[0]
      if (!row?.earliest || !row?.latest) continue
      const rowEarliest = new Date(row.earliest).toISOString().slice(0, 10)
      const rowLatest = new Date(row.latest).toISOString().slice(0, 10)
      if (earliest === null || rowEarliest < earliest) earliest = rowEarliest
      if (latest === null || rowLatest > latest) latest = rowLatest
    }
    return { earliestDate: earliest, latestDate: latest }
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
    const confidence = combineOrdersConfidence(
      computeOrdersConfidence({
        orders: currentRows.length,
        days: daysBetweenDates(startDate, endDate),
      }),
      computeOrdersConfidence({
        orders: previousRows.length,
        days: daysBetweenDates(previousStart, previousEnd),
      })
    )
    const summary = this.buildSummary(items, previousRows, confidence)

    return { items, summary }
  }

  async getSalesByConnection(
    actor: AuthenticatedActor,
    query: OrdersQuery
  ): Promise<StoreSalesRow[]> {
    const endDate = query.endDate ? new Date(query.endDate) : new Date()
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const periodMs = endDate.getTime() - startDate.getTime()
    const previousStart = new Date(startDate.getTime() - periodMs)
    const previousEnd = new Date(startDate.getTime() - 1)

    const [current, previous] = await Promise.all([
      this.fetchConnectionOrderRows(actor, startDate, endDate),
      this.fetchConnectionOrderRows(actor, previousStart, previousEnd),
    ])

    const bucket = (rows: Array<OrderSummaryView & { connectionId: string }>) => {
      const map = new Map<
        string,
        { platform: OrderPlatform; totalSales: number; orderCount: number }
      >()
      for (const row of rows) {
        const existing = map.get(row.connectionId) ?? {
          platform: row.platform,
          totalSales: 0,
          orderCount: 0,
        }
        existing.totalSales += row.amount
        existing.orderCount += 1
        map.set(row.connectionId, existing)
      }
      return map
    }

    const currentMap = bucket(current)
    const previousMap = bucket(previous)

    return [...currentMap.entries()].map(([connectionId, figures]) => {
      const previousFigures = previousMap.get(connectionId)
      return {
        connectionId,
        platform: figures.platform,
        totalSales: figures.totalSales,
        totalSalesChangePct: computeChangePct(figures.totalSales, previousFigures?.totalSales ?? 0),
        orderCount: figures.orderCount,
        orderCountChangePct: computeChangePct(figures.orderCount, previousFigures?.orderCount ?? 0),
        averageOrderValue: figures.orderCount > 0 ? figures.totalSales / figures.orderCount : 0,
      }
    })
  }

  // Same provider loop as fetchOrderRows, just with connection_id also selected and carried
  // through onto the result -- a separate method rather than extending fetchOrderRows/
  // OrderSummaryView itself, to keep the existing (well-exercised) orders list/summary path
  // completely untouched.
  private async fetchConnectionOrderRows(
    actor: AuthenticatedActor,
    start: Date,
    end: Date
  ): Promise<Array<OrderSummaryView & { connectionId: string }>> {
    const providerPromises = (Object.keys(PROVIDER_CONFIG) as ProviderKey[]).map(
      async (provider) => {
        const config = PROVIDER_CONFIG[provider]
        const result = await this.db.query<OrderRecordRow & { connection_id: string }>({
          name: `orders-by-connection-${provider}`,
          text: `
          SELECT o.entity_id, o.payload, o.updated_at, o.connection_id
          FROM ${config.recordsTable} o
          JOIN ${config.connectionsTable} c ON c.id = o.connection_id
          WHERE o.entity_type = 'orders'
            AND c.organization_id = $1
            AND c.deleted_at IS NULL
            AND c.status = 'connected'
            AND ($2::uuid IS NULL OR c.workspace_id = $2::uuid)
            AND o.record_date >= $3::date
            AND o.record_date <= $4::date
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
        return result.rows.map((row) => ({
          ...config.normalize(row),
          connectionId: row.connection_id,
        }))
      }
    )
    const results = await Promise.all(providerPromises)
    return results.flat()
  }

  private async fetchOrderRows(
    actor: AuthenticatedActor,
    start: Date,
    end: Date
  ): Promise<OrderSummaryView[]> {
    const providerPromises = (Object.keys(PROVIDER_CONFIG) as ProviderKey[]).map(
      async (provider) => {
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
      }
    )

    const results = await Promise.all([
      ...providerPromises,
      this.fetchMadarOrderRows(actor, start, end),
    ])

    return results.flat()
  }

  // Madar orders aren't shaped around a connection-joined records table the way the three
  // synced providers are (see PROVIDER_CONFIG's own doc comment) -- they're created directly by
  // a user in an org/workspace, with no OAuth connection of their own. Kept as its own parallel
  // path rather than forced into PROVIDER_CONFIG's shape, per the plan's explicit decision.
  private async fetchMadarOrderRows(
    actor: AuthenticatedActor,
    start: Date,
    end: Date
  ): Promise<OrderSummaryView[]> {
    const result = await this.db.query<MadarOrderAggregateRow>({
      name: "orders-aggregation-madar",
      text: `
        SELECT o.id, o.order_number, o.customer_name, o.status, o.payment_status,
               o.total_amount, o.currency, o.created_at, o.salla_push_status
        FROM madar_orders o
        WHERE o.organization_id = $1
          AND ($2::uuid IS NULL OR o.workspace_id = $2::uuid)
          AND o.created_at::date >= $3::date
          AND o.created_at::date <= $4::date
        ORDER BY o.created_at DESC
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
    if (result.rows.length === 0) return []

    // A separate query merged in JS, not a correlated subquery or a JOIN+json_agg -- pg-mem (this
    // codebase's test harness) can't resolve a subquery that references the outer query's own
    // alias, the same class of gap already documented elsewhere in this codebase (ANY($1::uuid[]),
    // FILTER). Matches PosInvoicesService.list()'s own items-merged-in-a-Map pattern.
    const orderIds = result.rows.map((row) => row.id)
    const idPlaceholders = orderIds.map((_, index) => `$${index + 1}`).join(", ")
    const itemRows = await this.db.query<{
      order_id: string
      product_name: string
      quantity: string | number
    }>(
      `SELECT order_id, product_name, quantity FROM madar_order_items WHERE order_id IN (${idPlaceholders})`,
      orderIds
    )
    const itemsByOrder = new Map<string, Array<{ name: string; quantity: number }>>()
    for (const item of itemRows.rows) {
      const list = itemsByOrder.get(item.order_id) ?? []
      list.push({ name: item.product_name, quantity: Number(item.quantity) || 0 })
      itemsByOrder.set(item.order_id, list)
    }

    return result.rows.map((row) => normalizeMadarOrder(row, itemsByOrder.get(row.id) ?? []))
  }

  private buildSummary(
    current: OrderSummaryView[],
    previous: OrderSummaryView[],
    confidence: OrdersConfidenceLevel
  ): OrdersSummaryStats {
    const currentSales = current.reduce((sum, o) => sum + o.amount, 0)
    const previousSales = previous.reduce((sum, o) => sum + o.amount, 0)
    const currentCompleted = current.filter((o) => o.orderStatus === "Completed").length
    const previousCompleted = previous.filter((o) => o.orderStatus === "Completed").length
    const currentProcessing = current.filter((o) => o.orderStatus === "Processing").length
    const previousProcessing = previous.filter((o) => o.orderStatus === "Processing").length
    const currentCancelled = current.filter((o) => o.orderStatus === "Cancelled").length
    const previousCancelled = previous.filter((o) => o.orderStatus === "Cancelled").length
    const currentAov = current.length > 0 ? currentSales / current.length : 0
    const previousAov = previous.length > 0 ? previousSales / previous.length : 0

    return {
      totalOrders: current.length,
      totalOrdersChangePct: computeChangePct(current.length, previous.length),
      previousTotalOrders: previous.length,
      totalSales: currentSales,
      totalSalesChangePct: computeChangePct(currentSales, previousSales),
      previousTotalSales: previousSales,
      averageOrderValue: currentAov,
      averageOrderValueChangePct: computeChangePct(currentAov, previousAov),
      previousAverageOrderValue: previousAov,
      completedOrders: currentCompleted,
      completedOrdersChangePct: computeChangePct(currentCompleted, previousCompleted),
      processingOrders: currentProcessing,
      processingOrdersChangePct: computeChangePct(currentProcessing, previousProcessing),
      cancelledOrders: currentCancelled,
      cancelledOrdersChangePct: computeChangePct(currentCancelled, previousCancelled),
      decomposition: decomposeRevenueChange(
        { orders: current.length, aov: currentAov },
        { orders: previous.length, aov: previousAov }
      ),
      confidence,
    }
  }
}
