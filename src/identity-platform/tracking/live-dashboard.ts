// Aggregation for the live-visitors dashboard (GET /v1/tracking/live-dashboard).
//
// Deliberately pure and computed in TypeScript rather than SQL. The window is minutes wide (see
// TrackingRemoteConfig.live_visitor_timeout), so the row count is small, and the interesting
// numbers come out of tracking_events.properties -- merchant-supplied JSON whose `price` or
// `revenue` can be a number, a numeric string, or something unusable. Coercing that in SQL means
// either a cast that throws on the first odd value a storefront sends, or regex guards that
// pg-mem (this codebase's test database) does not implement. Doing it here keeps the query
// trivially portable and every edge case unit-testable without a database.

import type { LiveVisitorRow } from "./repository"

export interface LiveEventRow {
  eventType: string
  visitorId: string
  properties: Record<string, unknown> | null
  occurredAt: string
}

export interface LiveDashboardSummary {
  liveVisitors: number
  activePlatforms: number
  pageViews: number
  addToCarts: number
  productsAddedToCart: number
  orders: number
  cartValue: number
  orderValue: number
  engagementRate: number
}

export interface LiveBreakdownEntry {
  label: string
  code: string | null
  visitors: number
  share: number
}

export interface LiveCartAddition {
  productId: string | null
  productName: string | null
  price: number | null
  quantity: number | null
  currency: string | null
  occurredAt: string
}

export interface LiveTopProduct {
  productId: string
  productName: string | null
  views: number
  addToCarts: number
}

// Event types that represent a deliberate commerce action rather than mere presence. PAGE_VIEW is
// excluded because every visitor produces one, HEARTBEAT because it is an automatic ping, and
// IDENTIFY because it fires from the storefront's own login state, not from anything the visitor
// did on this visit.
const ENGAGED_EVENT_TYPES = new Set([
  "PRODUCT_VIEW",
  "PRODUCT_LIST_VIEW",
  "SEARCH",
  "ADD_TO_CART",
  "REMOVE_FROM_CART",
  "CART_VIEW",
  "CHECKOUT_STARTED",
  "CHECKOUT_COMPLETED",
  "PURCHASE",
])

// Merchant snippets send numbers as numbers or as strings ("1000.00"), and occasionally as
// something meaningless. Anything that isn't a finite number is treated as absent rather than
// coerced to 0, so a malformed value never quietly drags a total down.
export function readNumber(
  properties: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const value = properties?.[key]
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function readString(
  properties: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = properties?.[key]
  if (typeof value === "string" && value.length > 0) return value
  if (typeof value === "number") return String(value)
  return null
}

function toShare(count: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((count / total) * 1000) / 10
}

// Groups live visitors by a field, largest first. Rows with no value are collected under a single
// "unknown" bucket rather than dropped, so the shares always add up to the visitor count.
function groupVisitors(
  visitors: LiveVisitorRow[],
  pick: (visitor: LiveVisitorRow) => { label: string | null; code: string | null }
): LiveBreakdownEntry[] {
  const buckets = new Map<string, LiveBreakdownEntry>()

  for (const visitor of visitors) {
    const { label, code } = pick(visitor)
    const key = label ?? "__unknown__"
    const existing = buckets.get(key)
    if (existing) {
      existing.visitors += 1
      continue
    }
    buckets.set(key, { label: label ?? "", code: label ? code : null, visitors: 1, share: 0 })
  }

  const entries = [...buckets.values()].sort((a, b) => b.visitors - a.visitors)
  for (const entry of entries) entry.share = toShare(entry.visitors, visitors.length)
  return entries
}

export function summarize(input: {
  visitors: LiveVisitorRow[]
  events: LiveEventRow[]
  activePlatforms: number
}): LiveDashboardSummary {
  const { visitors, events, activePlatforms } = input

  let pageViews = 0
  let addToCarts = 0
  let orders = 0
  let cartValue = 0
  let orderValue = 0
  const addedProductIds = new Set<string>()
  const engagedVisitorIds = new Set<string>()

  for (const event of events) {
    if (ENGAGED_EVENT_TYPES.has(event.eventType)) engagedVisitorIds.add(event.visitorId)

    switch (event.eventType) {
      case "PAGE_VIEW":
        pageViews += 1
        break
      case "ADD_TO_CART": {
        addToCarts += 1
        const productId = readString(event.properties, "product_id")
        if (productId) addedProductIds.add(productId)
        const price = readNumber(event.properties, "price")
        if (price !== null) {
          // A missing quantity means one unit -- the common case for a storefront that sends
          // price without it -- rather than excluding the line from the cart total entirely.
          cartValue += price * (readNumber(event.properties, "quantity") ?? 1)
        }
        break
      }
      case "PURCHASE": {
        orders += 1
        const revenue =
          readNumber(event.properties, "revenue") ?? readNumber(event.properties, "value")
        if (revenue !== null) orderValue += revenue
        break
      }
      default:
        break
    }
  }

  return {
    liveVisitors: visitors.length,
    activePlatforms,
    pageViews,
    addToCarts,
    productsAddedToCart: addedProductIds.size,
    orders,
    // Rounded to cents: these are sums of merchant-supplied floats, which drift
    // (0.1 + 0.2) and would otherwise surface as 1245.7500000000002 in the UI.
    cartValue: Math.round(cartValue * 100) / 100,
    orderValue: Math.round(orderValue * 100) / 100,
    // Share of currently-live visitors who took at least one commerce action in the window.
    // Denominated in live visitors, not in visitors seen in events, so it can't exceed 100%
    // when a visitor's session ended mid-window.
    engagementRate: toShare(
      [...engagedVisitorIds].filter((id) => visitors.some((v) => v.visitorId === id)).length,
      visitors.length
    ),
  }
}

export function countryBreakdown(visitors: LiveVisitorRow[]): LiveBreakdownEntry[] {
  return groupVisitors(visitors, (visitor) => ({ label: visitor.country, code: visitor.country }))
}

export function trafficSourceBreakdown(visitors: LiveVisitorRow[]): LiveBreakdownEntry[] {
  return groupVisitors(visitors, (visitor) => ({ label: visitor.trafficSource, code: null }))
}

export function recentCartAdditions(events: LiveEventRow[], limit = 8): LiveCartAddition[] {
  return events
    .filter((event) => event.eventType === "ADD_TO_CART")
    .slice(0, limit)
    .map((event) => ({
      productId: readString(event.properties, "product_id"),
      productName: readString(event.properties, "product_name"),
      price: readNumber(event.properties, "price"),
      quantity: readNumber(event.properties, "quantity"),
      currency: readString(event.properties, "currency"),
      occurredAt: event.occurredAt,
    }))
}

// Ranked by add-to-carts first, then views: a product being added is a stronger signal than a
// product being looked at, and ranking purely by views would bury whatever is actually selling.
export function topProducts(events: LiveEventRow[], limit = 6): LiveTopProduct[] {
  const byProduct = new Map<string, LiveTopProduct>()

  for (const event of events) {
    if (event.eventType !== "PRODUCT_VIEW" && event.eventType !== "ADD_TO_CART") continue
    const productId = readString(event.properties, "product_id")
    if (!productId) continue

    const entry = byProduct.get(productId) ?? {
      productId,
      productName: null,
      views: 0,
      addToCarts: 0,
    }
    entry.productName = entry.productName ?? readString(event.properties, "product_name")
    if (event.eventType === "PRODUCT_VIEW") entry.views += 1
    else entry.addToCarts += 1
    byProduct.set(productId, entry)
  }

  return [...byProduct.values()]
    .sort((a, b) => b.addToCarts - a.addToCarts || b.views - a.views)
    .slice(0, limit)
}
