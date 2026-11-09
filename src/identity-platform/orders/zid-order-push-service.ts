import { IntegrationProviderError } from "../integrations/provider-error"
import type { ZidOAuthService } from "../zid-oauth/service"
import type { MadarOrderPushInput } from "./salla-order-push-service"

const DEFAULT_ZID_API_BASE_URL = "https://api.zid.sa/v1"

// What each of Madar's payment codes looks like among a Zid store's payment methods (their codes
// and names, e.g. "zid_cod", "payment_link.zidpay", "Bank transfer").
const PAYMENT_METHOD_HINTS: Record<string, string[]> = {
  cash: ["cod", "cash"],
  cod: ["cod", "cash"],
  bank_transfer: ["bank", "transfer"],
  card: ["zidpay", "credit", "card", "mada"],
  mada: ["mada", "zidpay", "credit", "card"],
}

// Zid's 401/403 body names what it refused (a missing scope, a bad token) -- kept in the logs,
// since the error stored on the order is a generic message.
async function logZidRefusal(response: Response) {
  const body = await response.text().catch(() => "")
  console.error("zid.order_push_refused", {
    url: response.url,
    status: response.status,
    body: body.slice(0, 500),
  })
}

// https://docs.zid.sa/create-order-20612055e0 -- POST /managers/store/drafts, Zid's own
// "merchant creates an order on the customer's behalf" endpoint, the closest equivalent to
// Salla's /orders/external push. Needs the third_create_order scope (docs.zid.sa lists both
// third_create_order and order_create for this -- confirm which one the Partner Dashboard
// actually wants), which no connection this session has ever requested (see
// zid-oauth/service.ts's DEFAULT_SCOPES) -- every store will need to reconnect once that scope is
// added before any push here can succeed.
//
// Several field shapes below are grounded in docs.zid.sa's own schema text, not a confirmed real
// request/response (the docs page never shows one worked example, and a live test would create a
// real draft order in the connected store, not something to do silently) -- flagged inline where
// the choice is a judgment call rather than a confirmed fact. A real test push is the next
// concrete step once the new scope is live, the same "Phase 0" discipline this session's other
// Zid work followed throughout.
export interface ZidOrderPushItem {
  zidSku: string
  quantity: number
}

export interface ZidPushResult {
  zidOrderId: string
}

interface ResolvedShippingMethod {
  id: number
  type: string
}

const COUNTRY_DIALING_CODES: Record<string, string> = { SA: "966" }

// Unlike Salla's receiver.phone (a single E.164 string), Zid's create-order schema wants the
// country code and local number as two separate fields.
function splitPhone(phone: string, countryCode: string): { countryCode: string; number: string } {
  const digits = phone.replace(/\D/g, "")
  const dialingCode = COUNTRY_DIALING_CODES[countryCode.toUpperCase()] ?? ""
  const withoutAccessCode = digits.startsWith("00") ? digits.slice(2) : digits
  if (dialingCode && withoutAccessCode.startsWith(dialingCode)) {
    return { countryCode: dialingCode, number: withoutAccessCode.slice(dialingCode.length) }
  }
  const local = withoutAccessCode.startsWith("0") ? withoutAccessCode.slice(1) : withoutAccessCode
  return { countryCode: dialingCode || "966", number: local }
}

// The one pure, independently testable piece of this file -- every Zid-field decision lives
// here, nowhere else. `is_gift`/`is_gifted_consignee_notifiable` are hardcoded false: Madar has
// no gift-order concept, and `created_by`/`customer_comment` are the two fields docs.zid.sa lists
// as required without describing valid values for -- "api" and "" are the least presumptuous
// defaults, not confirmed against a real accepted request.
export function mapMadarOrderToZidDraft(
  order: MadarOrderPushInput,
  items: ZidOrderPushItem[],
  shippingMethod: ResolvedShippingMethod,
  paymentMethodId: number
): Record<string, unknown> {
  const customerPhone = order.customerPhone
    ? splitPhone(order.customerPhone, order.receiver.countryCode)
    : splitPhone(order.receiver.phone, order.receiver.countryCode)
  const consigneePhone = splitPhone(order.receiver.phone, order.receiver.countryCode)

  // docs.zid.sa/create-order-20612055e0: every address field is required, unknown ones as null
  // (lat/lng/short_address) or "" (meta), and an absent coupon/comment is null -- an empty string
  // coupon is looked up as a code.
  const address = order.shipTo
  return {
    currency_code: order.currency,
    coupon_code: order.discountCode?.trim() || null,
    customer: {
      full_name: order.customerName,
      mobile_country_code: customerPhone.countryCode,
      mobile_number: customerPhone.number,
      email: order.customerEmail ?? "",
    },
    consignee: {
      contact: {
        full_name: order.receiver.name,
        mobile_country_code: consigneePhone.countryCode,
        mobile_number: consigneePhone.number,
        email: order.receiver.email ?? "",
      },
      address: {
        line_1: address?.address ?? "",
        line_2: address?.district ?? "",
        city_name: address?.city ?? "",
        country_code: address?.country ?? order.receiver.countryCode,
        lat: null,
        lng: null,
        short_address: null,
        meta: {
          postcode: address?.postalCode ?? "",
          building_number: "",
          additional_number: "",
          city_name: address?.city ?? "",
        },
      },
    },
    is_gift: false,
    is_gifted_consignee_notifiable: false,
    products: items.map((item) => ({ sku: item.zidSku, quantity: item.quantity })),
    shipping_method: { id: shippingMethod.id, type: shippingMethod.type },
    payment_method: { id: paymentMethodId },
    customer_comment: null,
    created_by: "api",
  }
}

export class ZidOrderPushService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly zidOAuthService: ZidOAuthService,
    apiBaseUrl?: string
  ) {
    this.apiBaseUrl = (
      apiBaseUrl ??
      process.env.ZID_API_BASE_URL ??
      DEFAULT_ZID_API_BASE_URL
    ).replace(/\/$/, "")
  }

  // https://docs.zid.sa/list-store-delivery-options -- GET /managers/store/delivery-options.
  // create-order's shipping_method.id has no documented "how do I find a valid one" story beyond
  // this list, so the first entry this store has configured is used -- a store with several real
  // delivery options configured would need a real per-order choice this pass doesn't have.
  private async resolveShippingMethod(
    accessToken: string,
    authorizationHeader: string,
    deliveryMethod: "shipping" | "pickup" | null
  ): Promise<ResolvedShippingMethod | null> {
    const response = await fetch(
      `${this.apiBaseUrl}/managers/store/delivery-options?payload_type=simple`,
      {
        headers: {
          authorization: authorizationHeader,
          "x-manager-token": accessToken,
          accept: "application/json",
        },
      }
    )
    if (response.status === 401 || response.status === 403) {
      await logZidRefusal(response)
      throw new IntegrationProviderError(
        "Zid rejected the push -- the connection is missing a required scope.",
        "ZID_PUSH_UNAUTHORIZED",
        false,
        response.status
      )
    }
    if (!response.ok) return null
    const body = (await response.json()) as {
      delivery_options?: Array<{ id?: number; system_option_code?: string }>
    }
    const options = (body.delivery_options ?? []).filter((option) => option.id !== undefined)
    // A pickup order goes to the store's pickup option when it has one; otherwise (and for a
    // shipped order) the first option.
    const isPickup = (option: { system_option_code?: string }) =>
      /pick/i.test(option.system_option_code ?? "")
    const chosen =
      (deliveryMethod === "pickup" ? options.find(isPickup) : options.find((o) => !isPickup(o))) ??
      options[0]
    if (!chosen || chosen.id === undefined) return null
    return { id: chosen.id, type: chosen.system_option_code ?? "delivery" }
  }

  // https://docs.zid.sa/list-of-payment-method -- GET /managers/store/payment-methods, which
  // answers {code, payload: [{id, code, name, enabled, type, ...}]} (found live: reading `data`
  // instead found nothing, and every push failed with "no enabled payment method"). Madar's own
  // payment code is matched to one of the store's enabled methods by what it means; failing that,
  // the first enabled method is used.
  private async resolvePaymentMethodId(
    accessToken: string,
    authorizationHeader: string,
    paymentMethodCode: string
  ): Promise<number | null> {
    const response = await fetch(`${this.apiBaseUrl}/managers/store/payment-methods`, {
      headers: {
        authorization: authorizationHeader,
        "x-manager-token": accessToken,
        "accept-language": "en",
        accept: "application/json",
      },
    })
    if (response.status === 401 || response.status === 403) {
      await logZidRefusal(response)
      throw new IntegrationProviderError(
        "Zid rejected the push -- the connection is missing a required scope.",
        "ZID_PUSH_UNAUTHORIZED",
        false,
        response.status
      )
    }
    const text = await response.text().catch(() => "")
    if (!response.ok) {
      console.error("zid.payment_methods_failed", {
        status: response.status,
        body: text.slice(0, 500),
      })
      return null
    }
    let body: { payload?: unknown; data?: unknown } = {}
    try {
      body = JSON.parse(text) as typeof body
    } catch {
      // Not JSON -- logged below as "nothing usable".
    }
    const list = (
      Array.isArray(body.payload) ? body.payload : Array.isArray(body.data) ? body.data : []
    ) as Array<{
      id?: number | string
      code?: string
      name?: string
      enabled?: boolean | number | string
    }>
    const enabled = list.filter(
      (method) =>
        method.id !== undefined &&
        method.id !== null &&
        (method.enabled === true || method.enabled === 1 || method.enabled === "1")
    )
    if (enabled.length === 0) {
      console.error("zid.payment_methods_none_enabled", { body: text.slice(0, 800) })
      return null
    }
    const hints = PAYMENT_METHOD_HINTS[paymentMethodCode.toLowerCase()] ?? [
      paymentMethodCode.toLowerCase(),
    ]
    const matched = enabled.find((method) => {
      const haystack = `${method.code ?? ""} ${method.name ?? ""}`.toLowerCase()
      return hints.some((hint) => haystack.includes(hint))
    })
    return Number((matched ?? enabled[0]).id)
  }

  async pushOrder(
    connectionId: string,
    order: MadarOrderPushInput,
    items: ZidOrderPushItem[]
  ): Promise<ZidPushResult> {
    if (items.length === 0) {
      // None of this order's lines are a product actually linked to Zid (zid_product_links) --
      // create-order's products[] only ever accepts a real sku already in Zid's own catalog, so
      // there is nothing valid to send rather than a partial/wrong order.
      throw new IntegrationProviderError(
        "None of this order's products are linked to a Zid product.",
        "ZID_PUSH_NO_LINKED_ITEMS",
        false,
        422
      )
    }

    const { accessToken, authorizationHeader } =
      await this.zidOAuthService.resolveAccessToken(connectionId)

    const shippingMethod = await this.resolveShippingMethod(
      accessToken,
      authorizationHeader,
      order.deliveryMethod
    )
    if (!shippingMethod) {
      throw new IntegrationProviderError(
        "Zid has no delivery option configured for this store.",
        "ZID_PUSH_NO_SHIPPING_METHOD",
        false,
        422
      )
    }

    const paymentMethodId = await this.resolvePaymentMethodId(
      accessToken,
      authorizationHeader,
      order.paymentMethodCode
    )
    if (paymentMethodId === null) {
      throw new IntegrationProviderError(
        "Zid has no enabled payment method for this store.",
        "ZID_PUSH_NO_PAYMENT_METHOD",
        false,
        422
      )
    }

    const payload = mapMadarOrderToZidDraft(order, items, shippingMethod, paymentMethodId)

    const response = await fetch(`${this.apiBaseUrl}/managers/store/drafts`, {
      method: "POST",
      headers: {
        authorization: authorizationHeader,
        "x-manager-token": accessToken,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (response.status === 401 || response.status === 403) {
      await logZidRefusal(response)
      throw new IntegrationProviderError(
        "Zid rejected the push -- the connection is missing the third_create_order scope.",
        "ZID_PUSH_UNAUTHORIZED",
        false,
        response.status
      )
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      let body: unknown = null
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
      console.error("zid.order_push_rejected", {
        status: response.status,
        body: text.slice(0, 1500),
      })
      throw new IntegrationProviderError(
        "Zid rejected the order payload.",
        "ZID_PUSH_VALIDATION_FAILED",
        false,
        response.status,
        body
      )
    }

    // docs.zid.sa: the created draft comes back as `order`.
    const body = (await response.json()) as {
      order?: { id?: string | number }
      data?: { id?: string | number }
    }
    return { zidOrderId: String(body.order?.id ?? body.data?.id ?? "") }
  }
}
