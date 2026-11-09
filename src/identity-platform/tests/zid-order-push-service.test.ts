// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MadarOrderPushInput } from "../orders/salla-order-push-service"
import {
  mapMadarOrderToZidDraft,
  ZidOrderPushService,
  type ZidOrderPushItem,
} from "../orders/zid-order-push-service"
import { ZidOAuthService } from "../zid-oauth/service"

const BASE_ORDER: MadarOrderPushInput = {
  id: "order-1",
  currency: "SAR",
  subtotalAmount: 100,
  taxAmount: 15,
  customerName: "Test Customer",
  customerPhone: "0535585721",
  customerEmail: "customer@example.com",
  isGuestCustomer: false,
  paymentStatus: "paid",
  paymentMethodCode: "cod",
  totalAmount: 115,
  receiver: {
    name: "Test Receiver",
    phone: "0535585721",
    countryCode: "SA",
    email: null,
    notify: true,
  },
  deliveryMethod: "shipping",
  shipTo: {
    country: "SA",
    city: "Riyadh",
    district: "Olaya",
    address: "123 Main St",
    postalCode: "12345",
  },
  courierId: null,
  shippingCost: 0,
  discountCode: null,
  discountAmount: 0,
  shippingDiscountAmount: 0,
  items: [],
}

describe("mapMadarOrderToZidDraft", () => {
  it("maps a Madar order to Zid's draft-order shape, splitting the Saudi phone into country code + number", () => {
    const items: ZidOrderPushItem[] = [{ zidSku: "ZID-SKU-1", quantity: 2 }]
    const payload = mapMadarOrderToZidDraft(BASE_ORDER, items, { id: 10, type: "delivery" }, 20)

    expect(payload).toMatchObject({
      currency_code: "SAR",
      coupon_code: null,
      customer_comment: null,
      created_by: "api",
      customer: {
        full_name: "Test Customer",
        mobile_country_code: "966",
        mobile_number: "535585721",
        email: "customer@example.com",
      },
      consignee: {
        contact: {
          full_name: "Test Receiver",
          mobile_country_code: "966",
          mobile_number: "535585721",
        },
        address: {
          line_1: "123 Main St",
          line_2: "Olaya",
          city_name: "Riyadh",
          country_code: "SA",
          lat: null,
          lng: null,
          short_address: null,
          meta: {
            postcode: "12345",
            building_number: "",
            additional_number: "",
            city_name: "Riyadh",
          },
        },
      },
      is_gift: false,
      is_gifted_consignee_notifiable: false,
      products: [{ sku: "ZID-SKU-1", quantity: 2 }],
      shipping_method: { id: 10, type: "delivery" },
      payment_method: { id: 20 },
    })
  })

  it("falls back to an empty address when there is no shipTo (pickup orders)", () => {
    const payload = mapMadarOrderToZidDraft(
      { ...BASE_ORDER, deliveryMethod: "pickup", shipTo: null },
      [{ zidSku: "ZID-SKU-1", quantity: 1 }],
      { id: 10, type: "pickup" },
      20
    )

    expect((payload.consignee as { address: { city_name: string } }).address.city_name).toBe("")
  })
})

describe("ZidOrderPushService.pushOrder", () => {
  beforeEach(() => {
    vi.spyOn(ZidOAuthService.prototype, "resolveAccessToken").mockResolvedValue({
      accessToken: "test-access-token",
      authorizationHeader: "Bearer test-access-token",
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockFetchSequence(options: {
    deliveryOptionsStatus?: number
    paymentMethodsStatus?: number
    draftStatus?: number
    draftBody?: unknown
  }) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput) => {
      const url = String(rawInput)
      if (url.includes("/managers/store/delivery-options")) {
        return new Response(
          JSON.stringify({ delivery_options: [{ id: 10, system_option_code: "delivery" }] }),
          { status: options.deliveryOptionsStatus ?? 200 }
        )
      }
      if (url.includes("/managers/store/payment-methods")) {
        return new Response(
          // docs.zid.sa/list-of-payment-method: the methods come under `payload`.
          JSON.stringify({
            code: 200,
            payload: [
              { id: 19, code: "zid_bank_transfer", name: "Bank transfer", enabled: false },
              { id: 20, code: "zid_cod", name: "Cash on delivery", enabled: true },
              { id: 21, code: "payment_link.zidpay", name: "Zid Pay", enabled: true },
            ],
          }),
          { status: options.paymentMethodsStatus ?? 200 }
        )
      }
      if (url.includes("/managers/store/drafts")) {
        return new Response(
          JSON.stringify(options.draftBody ?? { status: "object", order: { id: 999 } }),
          {
            status: options.draftStatus ?? 201,
          }
        )
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
  }

  it("resolves the first delivery option and the payment method matching the order's own code, then posts the draft", async () => {
    mockFetchSequence({})
    const service = new ZidOrderPushService(new ZidOAuthService({} as never))

    const result = await service.pushOrder("connection-1", BASE_ORDER, [
      { zidSku: "ZID-SKU-1", quantity: 1 },
    ])

    expect(result).toEqual({ zidOrderId: "999" })
  })

  it("matches Madar's payment code to the store's enabled Zid method by meaning", async () => {
    const service = new ZidOrderPushService(new ZidOAuthService({} as never))
    const methodFor = async (paymentMethodCode: string) => {
      const fetchSpy = mockFetchSequence({})
      await service.pushOrder("connection-1", { ...BASE_ORDER, paymentMethodCode }, [
        { zidSku: "ZID-SKU-1", quantity: 1 },
      ])
      const draftCall = fetchSpy.mock.calls.find((call) => String(call[0]).includes("/drafts"))
      fetchSpy.mockRestore()
      return JSON.parse(String(draftCall?.[1]?.body)).payment_method
    }

    expect(await methodFor("card")).toEqual({ id: 21 })
    expect(await methodFor("cash")).toEqual({ id: 20 })
    // Bank transfer is disabled on this store -- the first enabled method stands in.
    expect(await methodFor("bank_transfer")).toEqual({ id: 20 })
  })

  it("sends a pickup order with the store's pickup option, and a shipped one with delivery", async () => {
    const service = new ZidOrderPushService(new ZidOAuthService({} as never))
    const shippingFor = async (deliveryMethod: "pickup" | "shipping") => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
        const url = String(rawInput)
        if (url.includes("/delivery-options")) {
          return new Response(
            JSON.stringify({
              delivery_options: [
                { id: 10, system_option_code: "delivery" },
                { id: 11, system_option_code: "pickup" },
              ],
            })
          )
        }
        if (url.includes("/payment-methods")) {
          return new Response(
            JSON.stringify({ payload: [{ id: 20, code: "zid_cod", enabled: true }] })
          )
        }
        return new Response(JSON.stringify({ order: { id: 5 } }), { status: 200 })
      })
      await service.pushOrder("connection-1", { ...BASE_ORDER, deliveryMethod }, [
        { zidSku: "ZID-SKU-1", quantity: 1 },
      ])
      const draftCall = fetchSpy.mock.calls.find((call) => String(call[0]).includes("/drafts"))
      fetchSpy.mockRestore()
      return JSON.parse(String(draftCall?.[1]?.body)).shipping_method
    }
    expect(await shippingFor("pickup")).toEqual({ id: 11, type: "pickup" })
    expect(await shippingFor("shipping")).toEqual({ id: 10, type: "delivery" })
  })

  it("throws ZID_PUSH_NO_LINKED_ITEMS when no items are given", async () => {
    const service = new ZidOrderPushService(new ZidOAuthService({} as never))

    await expect(service.pushOrder("connection-1", BASE_ORDER, [])).rejects.toMatchObject({
      code: "ZID_PUSH_NO_LINKED_ITEMS",
    })
  })

  it("throws ZID_PUSH_NO_SHIPPING_METHOD when the store has no delivery options configured", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput) => {
      const url = String(rawInput)
      if (url.includes("/managers/store/delivery-options")) {
        return new Response(JSON.stringify({ delivery_options: [] }), { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    const service = new ZidOrderPushService(new ZidOAuthService({} as never))

    await expect(
      service.pushOrder("connection-1", BASE_ORDER, [{ zidSku: "ZID-SKU-1", quantity: 1 }])
    ).rejects.toMatchObject({ code: "ZID_PUSH_NO_SHIPPING_METHOD" })
  })

  it("throws ZID_PUSH_UNAUTHORIZED when Zid rejects the push for a missing scope", async () => {
    mockFetchSequence({ draftStatus: 401, draftBody: {} })
    const service = new ZidOrderPushService(new ZidOAuthService({} as never))

    await expect(
      service.pushOrder("connection-1", BASE_ORDER, [{ zidSku: "ZID-SKU-1", quantity: 1 }])
    ).rejects.toMatchObject({ code: "ZID_PUSH_UNAUTHORIZED" })
  })

  it("throws ZID_PUSH_UNAUTHORIZED (not ZID_PUSH_NO_SHIPPING_METHOD) when delivery-options itself is unauthorized", async () => {
    mockFetchSequence({ deliveryOptionsStatus: 401 })
    const service = new ZidOrderPushService(new ZidOAuthService({} as never))

    await expect(
      service.pushOrder("connection-1", BASE_ORDER, [{ zidSku: "ZID-SKU-1", quantity: 1 }])
    ).rejects.toMatchObject({ code: "ZID_PUSH_UNAUTHORIZED" })
  })

  it("throws ZID_PUSH_UNAUTHORIZED (not ZID_PUSH_NO_PAYMENT_METHOD) when payment-methods itself is unauthorized", async () => {
    mockFetchSequence({ paymentMethodsStatus: 401 })
    const service = new ZidOrderPushService(new ZidOAuthService({} as never))

    await expect(
      service.pushOrder("connection-1", BASE_ORDER, [{ zidSku: "ZID-SKU-1", quantity: 1 }])
    ).rejects.toMatchObject({ code: "ZID_PUSH_UNAUTHORIZED" })
  })

  it("throws ZID_PUSH_VALIDATION_FAILED for any other non-ok response", async () => {
    mockFetchSequence({ draftStatus: 422, draftBody: { message: { description: "bad request" } } })
    const service = new ZidOrderPushService(new ZidOAuthService({} as never))

    await expect(
      service.pushOrder("connection-1", BASE_ORDER, [{ zidSku: "ZID-SKU-1", quantity: 1 }])
    ).rejects.toMatchObject({ code: "ZID_PUSH_VALIDATION_FAILED" })
  })
})
