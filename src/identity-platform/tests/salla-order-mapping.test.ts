import { describe, expect, it } from "vitest"

import {
  mapMadarOrderToSallaExternalOrder,
  type MadarOrderPushInput,
} from "../orders/salla-order-push-service"

function baseOrder(overrides: Partial<MadarOrderPushInput> = {}): MadarOrderPushInput {
  return {
    id: "order-1",
    currency: "SAR",
    subtotalAmount: 100,
    taxAmount: 15,
    customerName: "سارة أحمد",
    customerPhone: "0501234567",
    customerEmail: null,
    isGuestCustomer: true,
    paymentStatus: "paid",
    paymentMethodCode: "cash",
    totalAmount: 115,
    receiver: {
      name: "سارة أحمد",
      phone: "0501234567",
      countryCode: "SA",
      email: null,
      notify: true,
    },
    deliveryMethod: "pickup",
    shipTo: null,
    courierId: null,
    shippingCost: 0,
    discountCode: null,
    discountAmount: 0,
    shippingDiscountAmount: 0,
    items: [
      {
        name: "فستان",
        sku: "SKU-1",
        unitPrice: 100,
        quantity: 1,
        taxAmount: 15,
        discountAmount: 0,
        costPrice: null,
        weight: null,
      },
    ],
    ...overrides,
  }
}

describe("mapMadarOrderToSallaExternalOrder", () => {
  // Confirmed against Salla's real external-orders endpoint: a local-format Saudi number
  // ("0501234567") is rejected with alert.invalid_fields on receiver.phone no matter what
  // receiver.country_code says -- only full E.164 ("+966501234567") is accepted. See
  // salla-order-push-service.ts's toE164 for the fix this guards against regressing.
  it("normalizes a local Saudi phone number to E.164 for both receiver.phone and customer.mobile", () => {
    const payload = mapMadarOrderToSallaExternalOrder(baseOrder())
    const receiver = payload.receiver as { phone: string; country_code: string }
    const customer = payload.customer as { mobile?: string }

    expect(receiver.phone).toBe("+966501234567")
    expect(receiver.country_code).toBe("SA")
    expect(customer.mobile).toBe("+966501234567")
  })

  // Found live in stage testing: a number dialed with the "00" international access code
  // ("00966501234567") was being mishandled as local format (stripping just one leading "0"
  // instead of the whole "00" prefix), producing a malformed "+9660966501234567".
  it("normalizes a phone number dialed with the 00 international access code", () => {
    const payload = mapMadarOrderToSallaExternalOrder(
      baseOrder({
        receiver: {
          name: "سارة أحمد",
          phone: "00966501234567",
          countryCode: "SA",
          email: null,
          notify: true,
        },
      })
    )
    const receiver = payload.receiver as { phone: string }
    expect(receiver.phone).toBe("+966501234567")
  })

  it("leaves an already-E.164 phone number untouched", () => {
    const payload = mapMadarOrderToSallaExternalOrder(
      baseOrder({
        receiver: {
          name: "سارة أحمد",
          phone: "+966501234567",
          countryCode: "SA",
          email: null,
          notify: true,
        },
      })
    )
    const receiver = payload.receiver as { phone: string }
    expect(receiver.phone).toBe("+966501234567")
  })

  it("omits customer.mobile when no customer phone was given", () => {
    const payload = mapMadarOrderToSallaExternalOrder(baseOrder({ customerPhone: null }))
    const customer = payload.customer as { mobile?: string }
    expect(customer.mobile).toBeUndefined()
  })

  it("maps cash-on-delivery to Salla's cod payment method with an amount", () => {
    const payload = mapMadarOrderToSallaExternalOrder(baseOrder({ paymentMethodCode: "cod" }))
    const payment = payload.payment as {
      method: string
      cash_on_delivery?: { amount: number }
      gateway?: unknown
    }
    expect(payment.method).toBe("cod")
    expect(payment.cash_on_delivery?.amount).toBe(115)
    expect(payment.gateway).toBeUndefined()
  })

  it("maps any non-cod method to external_epayment with a gateway label", () => {
    const payload = mapMadarOrderToSallaExternalOrder(baseOrder({ paymentMethodCode: "card" }))
    const payment = payload.payment as {
      method: string
      gateway?: { label: string; reference_id: string }
    }
    expect(payment.method).toBe("external_epayment")
    expect(payment.gateway?.label).toBe("card")
    expect(payment.gateway?.reference_id).toBe("order-1")
  })

  // Found live in stage testing: Salla rejects a pending-payment order with
  // "payment.accepted_methods is required" -- confirmed empirically that a single-element array
  // matching the method already chosen (["cod"] or ["external_epayment"]) is what it wants.
  it("includes payment.accepted_methods matching the method when payment status is pending", () => {
    const payload = mapMadarOrderToSallaExternalOrder(
      baseOrder({ paymentStatus: "pending", paymentMethodCode: "cash" })
    )
    const payment = payload.payment as { status: string; accepted_methods?: string[] }
    expect(payment.status).toBe("pending_payment")
    expect(payment.accepted_methods).toEqual(["external_epayment"])
  })

  it("omits payment.accepted_methods when payment status is paid", () => {
    const payload = mapMadarOrderToSallaExternalOrder(baseOrder({ paymentStatus: "paid" }))
    const payment = payload.payment as { accepted_methods?: string[] }
    expect(payment.accepted_methods).toBeUndefined()
  })

  it("omits the discounts object when there is no discount", () => {
    const payload = mapMadarOrderToSallaExternalOrder(baseOrder())
    expect(payload.discounts).toBeUndefined()
  })

  it("includes discounts (all three sub-fields) when a discount is present", () => {
    const payload = mapMadarOrderToSallaExternalOrder(
      baseOrder({ discountAmount: 10, discountCode: "SAVE10", shippingDiscountAmount: 5 })
    )
    expect(payload.discounts).toEqual({ code: "SAVE10", amount: 10, shipping_amount: 5 })
  })

  it("omits ship_to for a pickup order even if shipTo data happens to be present", () => {
    const payload = mapMadarOrderToSallaExternalOrder(
      baseOrder({
        deliveryMethod: "pickup",
        shipTo: { country: "SA", city: "Riyadh", district: null, address: null, postalCode: null },
      })
    )
    expect(payload.ship_to).toBeUndefined()
  })

  it("includes ship_to for a shipping order", () => {
    const payload = mapMadarOrderToSallaExternalOrder(
      baseOrder({
        deliveryMethod: "shipping",
        shipTo: {
          country: "SA",
          city: "Riyadh",
          district: "Al Olaya",
          address: null,
          postalCode: null,
        },
      })
    )
    expect(payload.ship_to).toEqual({ country: "SA", city: "Riyadh", district: "Al Olaya" })
  })

  it("never sends a source field", () => {
    const payload = mapMadarOrderToSallaExternalOrder(baseOrder())
    expect(payload).not.toHaveProperty("source")
  })
})
