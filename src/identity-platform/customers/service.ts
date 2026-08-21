import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { IntegrationProviderError } from "../integrations/provider-error"

export type CustomerPlatform = "Salla" | "Shopify" | "Zid"
// Engagement recency, computed from real order dates -- not a field any provider syncs.
export type CustomerStatus = "new" | "active" | "at_risk" | "churned" | "inactive"
// Value tier, computed from real lifetime value/order count -- not a field any provider syncs.
export type CustomerSegment = "VIP" | "Loyal" | "One Time" | "New"

export interface CustomerOrderView {
  orderId: string
  status: string
  revenue: number
  currency: string
  itemCount: number
  createdAt: string
}

export interface CustomerSummary {
  id: string
  name: string
  email: string
  phone: string | null
  platform: CustomerPlatform
  createdAt: string
  totalOrders: number
  totalRevenue: number
  lifetimeValue: number
  lastPurchaseAt: string | null
  status: CustomerStatus
  segment: CustomerSegment
}

export interface CustomerDetail extends CustomerSummary {
  orders: CustomerOrderView[]
  productsPurchased: string[]
  averageOrderValue: number
}

const NEW_WINDOW_DAYS = 30
const ACTIVE_WINDOW_DAYS = 90
const AT_RISK_WINDOW_DAYS = 180
const VIP_LTV_THRESHOLD = 5000
const LOYAL_LTV_THRESHOLD = 1000
const LOYAL_ORDER_COUNT_THRESHOLD = 3

function daysSince(dateIso: string | null): number | null {
  if (!dateIso) return null
  const then = new Date(dateIso).getTime()
  if (Number.isNaN(then)) return null
  return (Date.now() - then) / (1000 * 60 * 60 * 24)
}

// Heuristic, not synced data: recency-based engagement tiers over real order dates. Documented
// here so the thresholds are easy to revisit rather than opaque magic numbers in the UI.
function computeStatus(input: {
  createdAt: string
  totalOrders: number
  lastPurchaseAt: string | null
}): CustomerStatus {
  if (input.totalOrders === 0) {
    const accountAgeDays = daysSince(input.createdAt)
    return accountAgeDays !== null && accountAgeDays <= NEW_WINDOW_DAYS ? "new" : "inactive"
  }

  const daysSinceLastPurchase = daysSince(input.lastPurchaseAt)
  if (daysSinceLastPurchase === null || daysSinceLastPurchase <= ACTIVE_WINDOW_DAYS) {
    return "active"
  }
  if (daysSinceLastPurchase <= AT_RISK_WINDOW_DAYS) {
    return "at_risk"
  }
  return "churned"
}

// Heuristic value tier over real lifetime value/order count -- deliberately kept independent
// of computeStatus's engagement-recency signal so the two badges don't just restate each other.
function computeSegment(input: { totalOrders: number; lifetimeValue: number }): CustomerSegment {
  if (input.totalOrders === 0) {
    return "New"
  }
  if (input.lifetimeValue >= VIP_LTV_THRESHOLD) {
    return "VIP"
  }
  if (
    input.lifetimeValue >= LOYAL_LTV_THRESHOLD ||
    input.totalOrders >= LOYAL_ORDER_COUNT_THRESHOLD
  ) {
    return "Loyal"
  }
  return "One Time"
}

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

interface CustomerRecordRow {
  entity_id: string
  payload: Record<string, unknown>
  updated_at: Date | string
  total_orders: string | number
  total_revenue: string | number | null
  last_purchase_at: Date | string | null
  [key: string]: unknown
}

interface OrderRecordRow {
  entity_id: string
  payload: Record<string, unknown>
  updated_at: Date | string
  [key: string]: unknown
}

function normalizeSallaCustomer(row: CustomerRecordRow): CustomerSummary {
  const payload = row.payload as {
    full_name?: string
    first_name?: string
    last_name?: string
    email?: string
    mobile?: string | number
    mobile_code?: string
    created_at?: { date?: string }
  }

  const name =
    payload.full_name || [payload.first_name, payload.last_name].filter(Boolean).join(" ")
  const phone = payload.mobile ? `${payload.mobile_code ?? ""}${payload.mobile}` : null
  const createdAt = payload.created_at?.date
    ? toIsoDate(payload.created_at.date)
    : toIsoDate(row.updated_at)
  const totalOrders = Number(row.total_orders) || 0
  const totalRevenue = Number(row.total_revenue) || 0
  const lastPurchaseAt = row.last_purchase_at ? toIsoDate(row.last_purchase_at) : null

  return {
    id: `salla:${row.entity_id}`,
    name: name || "Unnamed customer",
    email: payload.email ?? "",
    phone,
    platform: "Salla",
    createdAt,
    totalOrders,
    totalRevenue,
    lifetimeValue: totalRevenue,
    lastPurchaseAt,
    status: computeStatus({ createdAt, totalOrders, lastPurchaseAt }),
    segment: computeSegment({ totalOrders, lifetimeValue: totalRevenue }),
  }
}

function normalizeShopifyCustomer(row: CustomerRecordRow): CustomerSummary {
  const payload = row.payload as {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    created_at?: string
  }

  const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ")
  const createdAt = payload.created_at ? toIsoDate(payload.created_at) : toIsoDate(row.updated_at)
  const totalOrders = Number(row.total_orders) || 0
  const totalRevenue = Number(row.total_revenue) || 0
  const lastPurchaseAt = row.last_purchase_at ? toIsoDate(row.last_purchase_at) : null

  return {
    id: `shopify:${row.entity_id}`,
    name: name || "Unnamed customer",
    email: payload.email ?? "",
    phone: payload.phone ?? null,
    platform: "Shopify",
    createdAt,
    totalOrders,
    totalRevenue,
    lifetimeValue: totalRevenue,
    lastPurchaseAt,
    status: computeStatus({ createdAt, totalOrders, lastPurchaseAt }),
    segment: computeSegment({ totalOrders, lifetimeValue: totalRevenue }),
  }
}

function normalizeZidCustomer(row: CustomerRecordRow): CustomerSummary {
  const payload = row.payload as {
    name?: string
    email?: string
    mobile?: string
    created_at?: string
  }

  const createdAt = payload.created_at ? toIsoDate(payload.created_at) : toIsoDate(row.updated_at)
  const totalOrders = Number(row.total_orders) || 0
  const totalRevenue = Number(row.total_revenue) || 0
  const lastPurchaseAt = row.last_purchase_at ? toIsoDate(row.last_purchase_at) : null

  return {
    id: `zid:${row.entity_id}`,
    name: payload.name || "Unnamed customer",
    email: payload.email ?? "",
    phone: payload.mobile ?? null,
    platform: "Zid",
    createdAt,
    totalOrders,
    totalRevenue,
    lifetimeValue: totalRevenue,
    lastPurchaseAt,
    status: computeStatus({ createdAt, totalOrders, lastPurchaseAt }),
    segment: computeSegment({ totalOrders, lifetimeValue: totalRevenue }),
  }
}

// Confirmed against a real synced Salla order payload (stage: salla_records, entity_type
// 'orders'): total is {amount,currency}, status is {name, slug}, items[] have name+quantity
// but no product id (so "products purchased" can only surface names, not a category join).
function normalizeSallaOrder(row: OrderRecordRow): CustomerOrderView {
  const payload = row.payload as {
    status?: { name?: string; slug?: string }
    total?: { amount?: number; currency?: string }
    items?: Array<{ quantity?: number }>
    date?: { date?: string }
  }

  return {
    orderId: row.entity_id,
    status: payload.status?.name ?? payload.status?.slug ?? "unknown",
    revenue: Number(payload.total?.amount) || 0,
    currency: payload.total?.currency ?? "SAR",
    itemCount: (payload.items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    createdAt: payload.date?.date ? toIsoDate(payload.date.date) : toIsoDate(row.updated_at),
  }
}

// Standard Shopify Order REST shape (not yet verified against live data -- no Shopify orders
// synced in this environment): total_price is a plain string, financial_status is the closest
// analog to a customer-facing order status.
function normalizeShopifyOrder(row: OrderRecordRow): CustomerOrderView {
  const payload = row.payload as {
    financial_status?: string
    total_price?: string
    currency?: string
    line_items?: Array<{ quantity?: number }>
    created_at?: string
  }

  return {
    orderId: row.entity_id,
    status: payload.financial_status ?? "unknown",
    revenue: Number(payload.total_price) || 0,
    currency: payload.currency ?? "SAR",
    itemCount: (payload.line_items ?? []).reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    ),
    createdAt: payload.created_at ? toIsoDate(payload.created_at) : toIsoDate(row.updated_at),
  }
}

// Confirmed against Zid's official docs (docs.zid.sa/list-of-orders): order_total is a
// numeric string, order_status is {name, code}.
function normalizeZidOrder(row: OrderRecordRow): CustomerOrderView {
  const payload = row.payload as {
    order_status?: { name?: string; code?: string }
    order_total?: string
    currency_code?: string
    created_at?: string
  }

  return {
    orderId: row.entity_id,
    status: payload.order_status?.name ?? payload.order_status?.code ?? "unknown",
    revenue: Number(payload.order_total) || 0,
    currency: payload.currency_code ?? "SAR",
    itemCount: 0,
    createdAt: payload.created_at ? toIsoDate(payload.created_at) : toIsoDate(row.updated_at),
  }
}

type ProviderKey = "salla" | "shopify" | "zid"

const PROVIDER_CONFIG: Record<
  ProviderKey,
  {
    recordsTable: string
    connectionsTable: string
    customerIdPath: string
    orderTotalExpr: string
    normalizeCustomer: (row: CustomerRecordRow) => CustomerSummary
    normalizeOrder: (row: OrderRecordRow) => CustomerOrderView
  }
> = {
  salla: {
    recordsTable: "salla_records",
    connectionsTable: "salla_oauth_connections",
    customerIdPath: "o.payload->'customer'->>'id'",
    orderTotalExpr: "(o.payload->'total'->>'amount')::numeric",
    normalizeCustomer: normalizeSallaCustomer,
    normalizeOrder: normalizeSallaOrder,
  },
  shopify: {
    recordsTable: "shopify_records",
    connectionsTable: "shopify_oauth_connections",
    customerIdPath: "o.payload->'customer'->>'id'",
    orderTotalExpr: "(o.payload->>'total_price')::numeric",
    normalizeCustomer: normalizeShopifyCustomer,
    normalizeOrder: normalizeShopifyOrder,
  },
  zid: {
    recordsTable: "zid_records",
    connectionsTable: "zid_oauth_connections",
    customerIdPath: "o.payload->'customer'->>'id'",
    orderTotalExpr: "(o.payload->>'order_total')::numeric",
    normalizeCustomer: normalizeZidCustomer,
    normalizeOrder: normalizeZidOrder,
  },
}

const MAX_CUSTOMERS_PER_PROVIDER = 500
const MAX_ORDERS_PER_CUSTOMER = 200

export class CustomersAggregationService {
  constructor(private readonly db: PostgresDatabase) {}

  async listCustomers(actor: AuthenticatedActor): Promise<CustomerSummary[]> {
    const results = await Promise.all(
      (Object.keys(PROVIDER_CONFIG) as ProviderKey[]).map((provider) =>
        this.fetchProviderCustomers(provider, actor)
      )
    )

    return results.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getCustomer(actor: AuthenticatedActor, customerId: string): Promise<CustomerDetail | null> {
    const [provider, entityId] = customerId.split(":", 2)
    if (!provider || !entityId || !(provider in PROVIDER_CONFIG)) {
      throw new IntegrationProviderError("Invalid customer id.", "CUSTOMER_INVALID_ID", false, 400)
    }

    const config = PROVIDER_CONFIG[provider as ProviderKey]

    const summaryRows = await this.fetchProviderCustomers(provider as ProviderKey, actor, entityId)
    const summary = summaryRows[0]
    if (!summary) {
      return null
    }

    const ordersResult = await this.db.query<OrderRecordRow>({
      name: `customer-detail-orders-${provider}`,
      text: `
        SELECT o.entity_id, o.payload, o.updated_at
        FROM ${config.recordsTable} o
        JOIN ${config.connectionsTable} c ON c.id = o.connection_id
        WHERE o.entity_type = 'orders'
          AND ${config.customerIdPath} = $1
          AND c.organization_id = $2
          AND c.deleted_at IS NULL
          AND c.status = 'connected'
          AND ($3::uuid IS NULL OR c.workspace_id = $3::uuid)
        ORDER BY o.updated_at DESC
        LIMIT $4
      `,
      values: [entityId, actor.organizationId, actor.workspaceId ?? null, MAX_ORDERS_PER_CUSTOMER],
    })

    const orders = ordersResult.rows.map(config.normalizeOrder)
    const averageOrderValue = orders.length > 0 ? summary.totalRevenue / orders.length : 0

    const productsPurchased = Array.from(
      new Set(
        ordersResult.rows.flatMap((row) => {
          const items = (row.payload as { items?: Array<{ name?: string }> }).items ?? []
          return items.map((item) => item.name).filter((name): name is string => Boolean(name))
        })
      )
    )

    return { ...summary, orders, averageOrderValue, productsPurchased }
  }

  private async fetchProviderCustomers(
    provider: ProviderKey,
    actor: AuthenticatedActor,
    entityId?: string
  ): Promise<CustomerSummary[]> {
    const config = PROVIDER_CONFIG[provider]

    // A LEFT JOIN + GROUP BY here instead of a LATERAL subquery -- both are standard SQL and
    // correct on real Postgres, but pg-mem (used in tests) doesn't support LATERAL subqueries
    // correlated to an outer table's columns, so this is the portable form.
    const result = await this.db.query<CustomerRecordRow>({
      name: `customers-aggregation-${provider}${entityId ? "-single" : ""}`,
      text: `
        SELECT
          cr.entity_id AS entity_id,
          cr.payload AS payload,
          cr.updated_at AS updated_at,
          count(o.id) AS total_orders,
          sum(${config.orderTotalExpr}) AS total_revenue,
          max(o.updated_at) AS last_purchase_at
        FROM ${config.recordsTable} cr
        JOIN ${config.connectionsTable} c ON c.id = cr.connection_id
        LEFT JOIN ${config.recordsTable} o
          ON o.connection_id = cr.connection_id
          AND o.entity_type = 'orders'
          AND ${config.customerIdPath} = cr.entity_id
        WHERE cr.entity_type = 'customers'
          AND c.organization_id = $1
          AND c.deleted_at IS NULL
          AND c.status = 'connected'
          AND ($2::uuid IS NULL OR c.workspace_id = $2::uuid)
          AND ($3::text IS NULL OR cr.entity_id = $3::text)
        GROUP BY cr.entity_id, cr.payload, cr.updated_at
        ORDER BY cr.updated_at DESC
        LIMIT $4
      `,
      values: [
        actor.organizationId,
        actor.workspaceId ?? null,
        entityId ?? null,
        MAX_CUSTOMERS_PER_PROVIDER,
      ],
    })

    return result.rows.map(config.normalizeCustomer)
  }
}
