import type { TrackingEventType } from "./types"

// Salla customer events forwarded by Madar's Salla App Function (salla-app-functions/ in this
// repo) -- the storefront has no checkout event, so these arrive server to server. Only what the
// browser can't see is forwarded; add-to-cart stays with the storefront SDK, tied to the visitor.
// Payload shape per docs.salla.dev ("Cart & Checkout" customer events): { event, merchant,
// created_at, data }, with data.total/data.currency and a cart/checkout/order id.
export interface SallaAppEventBody {
  event?: unknown
  merchant?: unknown
  created_at?: unknown
  data?: unknown
}

export interface MappedSallaAppEvent {
  storeId: string
  eventType: TrackingEventType
  // Stable per checkout/order, so a retried delivery is recorded once.
  eventId: string
  sessionId: string
  properties: Record<string, unknown>
}

// Keyed by the event name with case and punctuation dropped, so "Checkout Started" and a
// "checkout.started"-style key both match.
const EVENT_TYPES: Record<string, TrackingEventType> = {
  checkoutstarted: "CHECKOUT_STARTED",
  ordercompleted: "PURCHASE",
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

function amount(value: unknown): number | null {
  if (value && typeof value === "object" && "amount" in value) {
    return amount((value as { amount: unknown }).amount)
  }
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null
}

export function mapSallaAppEvent(body: SallaAppEventBody): MappedSallaAppEvent | null {
  const eventName = text(body.event)
  const eventType = eventName
    ? EVENT_TYPES[eventName.toLowerCase().replace(/[^a-z]/g, "")]
    : undefined
  const storeId = text(body.merchant)
  if (!eventType || !storeId) return null

  const data = (body.data && typeof body.data === "object" ? body.data : {}) as Record<
    string,
    unknown
  >
  const referenceId =
    text(data.order_id) ?? text(data.checkout_id) ?? text(data.cart_id) ?? text(data.id)
  const total = amount(data.total) ?? amount(data.amount)
  const currency = text(data.currency)

  return {
    storeId,
    eventType,
    eventId: `salla:${eventType}:${storeId}:${referenceId ?? text(body.created_at) ?? "unknown"}`,
    sessionId: `salla:${referenceId ?? storeId}`,
    properties: {
      source: "salla_app_function",
      ...(referenceId ? { reference_id: referenceId } : {}),
      ...(total !== null
        ? { value: total, ...(eventType === "PURCHASE" ? { revenue: total } : {}) }
        : {}),
      ...(currency ? { currency } : {}),
      ...(Array.isArray(data.products) ? { products: data.products } : {}),
    },
  }
}
