import { IntegrationProviderError } from "../integrations/provider-error"
import type { ZidOAuthService } from "../zid-oauth/service"
import type { MadarOrderPushInput } from "./salla-order-push-service"

const DEFAULT_ZID_API_BASE_URL = "https://api.zid.sa/v1"

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

  return {
    currency_code: order.currency,
    coupon_code: order.discountCode ?? "",
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
      address: order.shipTo
        ? {
            line_1: order.shipTo.address ?? "",
            line_2: order.shipTo.district ?? "",
            city_name: order.shipTo.city,
            country_code: order.shipTo.country,
            meta: { postcode: order.shipTo.postalCode ?? "" },
          }
        : {
            line_1: "",
            city_name: "",
            country_code: order.receiver.countryCode,
            meta: {},
          },
    },
    is_gift: false,
    is_gifted_consignee_notifiable: false,
    products: items.map((item) => ({ sku: item.zidSku, quantity: item.quantity })),
    shipping_method: { id: shippingMethod.id, type: shippingMethod.type },
    payment_method: { id: paymentMethodId },
    customer_comment: "",
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
    authorizationHeader: string
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
    if (!response.ok) return null
    const body = (await response.json()) as {
      delivery_options?: Array<{ id?: number; system_option_code?: string }>
    }
    const first = body.delivery_options?.[0]
    if (!first || first.id === undefined) return null
    return { id: first.id, type: first.system_option_code ?? "delivery" }
  }

  // https://docs.zid.sa -- GET /managers/store/payment-methods. Matched against Madar's own
  // paymentMethodCode by substring (case-insensitive) against Zid's own code/name fields, falling
  // back to the first enabled method -- Zid's real code vocabulary isn't confirmed, so this is a
  // best-effort match, not a guaranteed-correct one.
  private async resolvePaymentMethodId(
    accessToken: string,
    authorizationHeader: string,
    paymentMethodCode: string
  ): Promise<number | null> {
    const response = await fetch(`${this.apiBaseUrl}/managers/store/payment-methods`, {
      headers: {
        authorization: authorizationHeader,
        "x-manager-token": accessToken,
        accept: "application/json",
      },
    })
    if (!response.ok) return null
    const body = (await response.json()) as {
      data?: Array<{ id?: number; code?: string; name?: string; enabled?: boolean }>
    }
    const enabled = (body.data ?? []).filter((method) => method.enabled && method.id !== undefined)
    const needle = paymentMethodCode.toLowerCase()
    const matched = enabled.find(
      (method) =>
        method.code?.toLowerCase().includes(needle) || method.name?.toLowerCase().includes(needle)
    )
    return (matched ?? enabled[0])?.id ?? null
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

    const shippingMethod = await this.resolveShippingMethod(accessToken, authorizationHeader)
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
      throw new IntegrationProviderError(
        "Zid rejected the push -- the connection is missing the third_create_order scope.",
        "ZID_PUSH_UNAUTHORIZED",
        false,
        response.status
      )
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new IntegrationProviderError(
        "Zid rejected the order payload.",
        "ZID_PUSH_VALIDATION_FAILED",
        false,
        response.status,
        body
      )
    }

    const body = (await response.json()) as { data?: { id?: string | number } }
    return { zidOrderId: String(body.data?.id ?? "") }
  }
}
