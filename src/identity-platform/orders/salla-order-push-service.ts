import { IntegrationProviderError } from "../integrations/provider-error"
import type { SallaOAuthService } from "../salla-oauth/service"

// https://docs.salla.dev/orders/external-orders -- the one real endpoint for reflecting an
// order created outside Salla back into a merchant's own Salla store. Separate from
// SALLA_API_BASE_URL in salla-oauth/service.ts (not exported from there) -- same default,
// same SALLA_API_BASE_URL env override, kept local so this file has no dependency on that
// module beyond the OAuth service it already needs for a token.
const DEFAULT_SALLA_API_BASE_URL = "https://api.salla.dev/admin/v2"

export interface MadarOrderPushItem {
  name: string
  sku: string | null
  unitPrice: number
  quantity: number
  taxAmount: number
  discountAmount: number
  costPrice: number | null
  weight: number | null
}

// What SallaOrderPushService actually needs to build a payload -- a plain shape rather than the
// full MadarOrderView, so this file stays independent of madar-orders-service.ts's row/view
// types (see the two-services split rationale in the plan: this is meant to be reusable by a
// future retry-queue worker that never goes through MadarOrdersService.create() at all).
export interface MadarOrderPushInput {
  id: string
  currency: string
  subtotalAmount: number
  taxAmount: number
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  isGuestCustomer: boolean
  paymentStatus: "paid" | "pending" | "refunded"
  paymentMethodCode: string
  totalAmount: number
  receiver: {
    name: string
    phone: string
    countryCode: string
    email: string | null
    notify: boolean
  }
  deliveryMethod: "shipping" | "pickup" | null
  shipTo: {
    country: string
    city: string
    district: string | null
    address: string | null
    postalCode: string | null
  } | null
  courierId: string | null
  shippingCost: number
  discountCode: string | null
  discountAmount: number
  shippingDiscountAmount: number
  items: MadarOrderPushItem[]
}

export interface SallaPushResult {
  sallaOrderId: string
  sallaReferenceId: string
}

// Salla's own external-order payment.method enum -- COD is its own distinct method; every other
// Madar payment_method_code (cash, card, bank_transfer, ...) collapses to "external_epayment"
// since Salla has no broader enum to map onto, with gateway.label carrying the real method name
// through for display on Salla's side.
const COD_METHOD_CODES = new Set(["cod", "cash_on_delivery"])

function mapPaymentStatus(status: "paid" | "pending" | "refunded"): "paid" | "pending_payment" {
  // Callers never push a 'refunded' order -- see MadarOrdersService.pushToSalla/retryPush,
  // which skip the push entirely for that status since Salla's payment.status enum has no
  // refunded equivalent. This mapping only has to cover the two statuses that actually reach it.
  return status === "paid" ? "paid" : "pending_payment"
}

// Confirmed against Salla's real API: both customer.mobile and receiver.phone require full E.164
// ("+966535585721") -- a local-format number ("0535585721") is rejected with alert.invalid_fields
// on receiver.phone regardless of what the separate receiver.country_code says (tested every
// combination). This platform is Saudi-only today (every receiver.countryCode this app ever sends
// is "SA" -- see migration 099's default and the Create Order form), so only Saudi Arabia's
// dialing code is mapped; an unrecognized country code falls back to a bare "+<digits>" rather
// than guessing a dialing code that could be wrong.
const COUNTRY_DIALING_CODES: Record<string, string> = { SA: "966" }

function toE164(phone: string, countryCode: string): string {
  const digits = phone.replace(/\D/g, "")
  const dialingCode = COUNTRY_DIALING_CODES[countryCode.toUpperCase()]
  if (!dialingCode) return `+${digits}`
  if (digits.startsWith(dialingCode)) return `+${digits}`
  // "00" is the international access code some people dial in place of "+" (e.g.
  // "00966535585721") -- stripped before the local-format check below, so it isn't mistaken for
  // just a single leading zero and left with a stray extra "0" in the result.
  const withoutAccessCode = digits.startsWith("00") ? digits.slice(2) : digits
  if (withoutAccessCode.startsWith(dialingCode)) return `+${withoutAccessCode}`
  const local = withoutAccessCode.startsWith("0") ? withoutAccessCode.slice(1) : withoutAccessCode
  return `+${dialingCode}${local}`
}

// Salla's ship_to.country/city are numeric ids into its own reference data (GET /countries,
// GET /countries/{id}/cities), not free text -- confirmed by a real rejection ("ship_to.country
// must be a number") against a plain "SA"/"Riyadh" payload. Resolved in SallaOrderPushService
// before calling this function (an async lookup, so it can't happen inside this otherwise-pure
// mapper) and passed in here already as ids.
export interface ResolvedShipToLocation {
  countryId: number
  cityId: number
}

// The one pure, independently testable piece of this file: every Salla-field decision from the
// plan lives here, nowhere else.
export function mapMadarOrderToSallaExternalOrder(
  order: MadarOrderPushInput,
  resolvedShipTo?: ResolvedShipToLocation
) {
  const isCod = COD_METHOD_CODES.has(order.paymentMethodCode)
  const paymentStatus = mapPaymentStatus(order.paymentStatus)
  const paymentMethod = isCod ? "cod" : "external_epayment"

  const payment: Record<string, unknown> = {
    status: paymentStatus,
    method: paymentMethod,
  }
  if (isCod) {
    payment.cash_on_delivery = { amount: order.totalAmount }
  } else {
    payment.gateway = { label: order.paymentMethodCode, reference_id: order.id }
  }
  // Confirmed against Salla's real API: payment.accepted_methods is required whenever status is
  // "pending_payment" -- Salla wants to know what method(s) will be accepted once the customer
  // actually pays. The same single method already chosen above is the only one this order will
  // ever settle through, so it's the only element. Not sent for "paid", which has nothing left to
  // accept.
  if (paymentStatus === "pending_payment") {
    payment.accepted_methods = [paymentMethod]
  }

  const customer: Record<string, unknown> = {
    name: order.customerName,
    is_guest: order.isGuestCustomer,
  }
  // No separate country code exists for the customer (only the receiver has one) -- reusing
  // the receiver's is the only country signal this input shape carries, which is harmless given
  // this platform is Saudi-only today (see COUNTRY_DIALING_CODES above).
  if (order.customerPhone) customer.mobile = toE164(order.customerPhone, order.receiver.countryCode)
  if (order.customerEmail) customer.email = order.customerEmail

  const payload: Record<string, unknown> = {
    external_order_id: `MADAR-${order.id}`,
    currency: order.currency,
    subtotal: order.subtotalAmount,
    tax: { value: order.taxAmount },
    customer,
    products: order.items.map((item) => {
      const product: Record<string, unknown> = {
        name: item.name,
        price: item.unitPrice,
        tax: { value: item.taxAmount },
        quantity: item.quantity,
      }
      if (item.sku) product.sku = item.sku
      if (item.costPrice !== null) product.cost_price = item.costPrice
      if (item.weight !== null) product.weight = item.weight
      if (item.discountAmount > 0) product.product_discount = item.discountAmount
      return product
    }),
    payment,
    receiver: {
      name: order.receiver.name,
      phone: toE164(order.receiver.phone, order.receiver.countryCode),
      country_code: order.receiver.countryCode,
      email: order.receiver.email,
      notify: order.receiver.notify,
    },
  }

  if (order.discountAmount > 0) {
    payload.discounts = {
      code: order.discountCode ?? "",
      amount: order.discountAmount,
      shipping_amount: order.shippingDiscountAmount,
    }
  }

  if (order.deliveryMethod) payload.delivery_method = order.deliveryMethod
  if (order.courierId) payload.courier_id = order.courierId
  if (order.shippingCost > 0) payload.shipping_cost = order.shippingCost

  if (order.deliveryMethod === "shipping" && order.shipTo && resolvedShipTo) {
    const shipTo: Record<string, unknown> = {
      country: resolvedShipTo.countryId,
      city: resolvedShipTo.cityId,
    }
    if (order.shipTo.district) shipTo.district = order.shipTo.district
    if (order.shipTo.address) shipTo.address = order.shipTo.address
    if (order.shipTo.postalCode) shipTo.postal_code = order.shipTo.postalCode
    payload.ship_to = shipTo
  }

  // source is deliberately omitted -- Salla's enum has no "Madar" value, and sending an
  // unrecognized one silently falls back to "other". Revisit only if Salla's partner docs add a
  // dedicated value for this integration.
  return payload
}

// Salla's own country/city reference lists (GET /countries, GET /countries/{id}/cities) --
// essentially static data (a government doesn't add a new country every day), so cached for this
// process's lifetime rather than re-fetched on every shipping push. Keyed by apiBaseUrl so a
// sandbox/production base URL override never shares a cache with the other.
const countryIdCache = new Map<string, Map<string, number>>()
const cityIdCache = new Map<string, Map<number, Map<string, number>>>()

async function fetchJson(
  url: string,
  accessToken: string
): Promise<{ data?: Array<Record<string, unknown>> } | null> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
  })
  if (!response.ok) return null
  return (await response.json()) as { data?: Array<Record<string, unknown>> }
}

async function resolveCountryId(
  apiBaseUrl: string,
  accessToken: string,
  countryCode: string
): Promise<number | null> {
  const key = countryCode.trim().toUpperCase()
  let countries = countryIdCache.get(apiBaseUrl)
  if (!countries) {
    const body = await fetchJson(`${apiBaseUrl}/countries?per_page=100`, accessToken)
    countries = new Map()
    for (const country of body?.data ?? []) {
      const code = typeof country.code === "string" ? country.code.toUpperCase() : null
      const id = typeof country.id === "number" ? country.id : null
      if (code && id !== null) countries.set(code, id)
    }
    countryIdCache.set(apiBaseUrl, countries)
  }
  return countries.get(key) ?? null
}

async function resolveCityId(
  apiBaseUrl: string,
  accessToken: string,
  countryId: number,
  cityName: string
): Promise<number | null> {
  const key = cityName.trim().toLowerCase()
  let byCountry = cityIdCache.get(apiBaseUrl)
  if (!byCountry) {
    byCountry = new Map()
    cityIdCache.set(apiBaseUrl, byCountry)
  }
  let cities = byCountry.get(countryId)
  if (!cities) {
    const body = await fetchJson(
      `${apiBaseUrl}/countries/${countryId}/cities?per_page=300`,
      accessToken
    )
    cities = new Map()
    // Matched against both the Arabic and English names -- a Madar user could reasonably type
    // either ("الرياض" or "Riyadh") into the plain shipToCity text field.
    for (const city of body?.data ?? []) {
      const id = typeof city.id === "number" ? city.id : null
      if (id === null) continue
      if (typeof city.name === "string") cities.set(city.name.trim().toLowerCase(), id)
      if (typeof city.name_en === "string") cities.set(city.name_en.trim().toLowerCase(), id)
    }
    byCountry.set(countryId, cities)
  }
  return cities.get(key) ?? null
}

export class SallaOrderPushService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly sallaOAuthService: SallaOAuthService,
    apiBaseUrl?: string
  ) {
    this.apiBaseUrl = (
      apiBaseUrl ??
      process.env.SALLA_API_BASE_URL ??
      DEFAULT_SALLA_API_BASE_URL
    ).replace(/\/$/, "")
  }

  async pushOrder(connectionId: string, order: MadarOrderPushInput): Promise<SallaPushResult> {
    const accessToken = await this.sallaOAuthService.resolveAccessToken(connectionId)

    let resolvedShipTo: ResolvedShipToLocation | undefined
    if (order.deliveryMethod === "shipping" && order.shipTo) {
      const countryId = await resolveCountryId(this.apiBaseUrl, accessToken, order.shipTo.country)
      if (countryId === null) {
        throw new IntegrationProviderError(
          `Salla has no matching country for "${order.shipTo.country}".`,
          "SALLA_PUSH_SHIP_TO_COUNTRY_NOT_FOUND",
          false,
          422
        )
      }
      const cityId = await resolveCityId(this.apiBaseUrl, accessToken, countryId, order.shipTo.city)
      if (cityId === null) {
        throw new IntegrationProviderError(
          `Salla has no matching city for "${order.shipTo.city}" in this country.`,
          "SALLA_PUSH_SHIP_TO_CITY_NOT_FOUND",
          false,
          422
        )
      }
      resolvedShipTo = { countryId, cityId }
    }

    const payload = mapMadarOrderToSallaExternalOrder(order, resolvedShipTo)

    const response = await fetch(`${this.apiBaseUrl}/orders/external`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (response.status === 401) {
      throw new IntegrationProviderError(
        "Salla rejected the push -- the connection is missing the orders.read_write scope.",
        "SALLA_PUSH_UNAUTHORIZED",
        false,
        401
      )
    }

    if (response.status === 422) {
      const body = await response.json().catch(() => null)
      if (body?.error?.fields?.external_order_id) {
        // Idempotent-retry signal, not a real failure -- see external_order_id's doc comment on
        // the mapping above. The caller (MadarOrdersService) treats this as "already pushed,
        // reconcile" rather than a failed push.
        throw new IntegrationProviderError(
          "This order was already pushed to Salla.",
          "SALLA_PUSH_DUPLICATE",
          false,
          422,
          body
        )
      }
      throw new IntegrationProviderError(
        "Salla rejected the order payload.",
        "SALLA_PUSH_VALIDATION_FAILED",
        false,
        422,
        body
      )
    }

    if (!response.ok) {
      throw new IntegrationProviderError(
        "The request to push this order to Salla failed.",
        "SALLA_PUSH_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as {
      data?: { id?: string | number; reference_id?: string | number }
    }
    return {
      sallaOrderId: String(body.data?.id ?? ""),
      sallaReferenceId: String(body.data?.reference_id ?? ""),
    }
  }
}
