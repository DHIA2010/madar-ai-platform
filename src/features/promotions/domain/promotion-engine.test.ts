import { describe, expect, it } from "vitest"

import type { Promotion } from "../types/promotion.types"
import { bestPromotionFor, promotionStatus, promotionUnitDiscount } from "./promotion-engine"

const base: Promotion = {
  id: "p1",
  name: "عرض",
  discountType: "percent",
  discountValue: 10,
  maxDiscountPerUnit: null,
  amountIncludesTax: true,
  scope: "all",
  productIds: [],
  categories: [],
  excludedProductIds: [],
  workspaceIds: [],
  startsAt: null,
  endsAt: null,
  daysOfWeek: [],
  startTime: null,
  endTime: null,
  licenceNumber: null,
  isPaused: false,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  stats: { invoiceCount: 0, unitCount: 0, discountTotal: 0 },
}

// A Saturday, 14:30 local time.
const now = new Date(2026, 10, 7, 14, 30)

const line = {
  productId: "prod-a",
  category: "ملابس",
  unitPrice: 115,
  quantity: 2,
  priceIncludesTax: true,
  taxRate: 0.15,
}

describe("promotion engine", () => {
  it("takes a percentage or fixed amount off each unit, capped and never past the price", () => {
    const net = (promotion: Promotion, priceIncludesTax = true) =>
      bestPromotionFor([promotion], { ...line, priceIncludesTax }, now, null)?.netDiscount
    // 10% of 115 incl. VAT = 10.00 net per unit, x2.
    expect(net(base)).toBe(20)
    // A net price: 10% of 115 = 11.50, x2.
    expect(net(base, false)).toBe(23)
    // Cap 5 incl. VAT = 4.35 net per unit; cap 5 excl. VAT = 5.
    expect(net({ ...base, maxDiscountPerUnit: 5 })).toBe(8.7)
    expect(net({ ...base, maxDiscountPerUnit: 5, amountIncludesTax: false })).toBe(10)
    // Fixed 23 incl. VAT = 20 net; fixed 20 excl. VAT = 20.
    const fixed = { ...base, discountType: "fixed" as const }
    expect(net({ ...fixed, discountValue: 23 })).toBe(40)
    expect(net({ ...fixed, discountValue: 20, amountIncludesTax: false })).toBe(40)
    // Never more than the item: 200 off a 100-net item takes 100.
    expect(net({ ...fixed, discountValue: 200 })).toBe(200)
    expect(promotionUnitDiscount({ ...fixed, discountValue: 5 }, { ...line, unitPrice: 0 })).toBe(0)
  })

  it("picks the best matching promotion for the customer", () => {
    const fixed = { ...base, id: "p2", discountType: "fixed" as const, discountValue: 15 }
    const otherCategory = {
      ...base,
      id: "p3",
      scope: "categories" as const,
      categories: ["أحذية"],
      discountValue: 50,
    }
    expect(bestPromotionFor([base, fixed, otherCategory], line, now, null)?.promotion.id).toBe("p2")
  })

  it("respects scope, exclusions, branches, dates, weekdays and hours", () => {
    const apply = (promotion: Promotion, workspaceId: string | null = "ws-1") =>
      bestPromotionFor([promotion], line, now, workspaceId)?.promotion.id ?? null
    expect(apply({ ...base, scope: "products", productIds: ["prod-a"] })).toBe("p1")
    expect(apply({ ...base, scope: "products", productIds: ["prod-b"] })).toBeNull()
    expect(apply({ ...base, scope: "categories", categories: ["ملابس"] })).toBe("p1")
    expect(apply({ ...base, excludedProductIds: ["prod-a"] })).toBeNull()
    expect(apply({ ...base, workspaceIds: ["ws-2"] })).toBeNull()
    expect(apply({ ...base, workspaceIds: ["ws-1"] })).toBe("p1")
    expect(apply({ ...base, isPaused: true })).toBeNull()
    expect(apply({ ...base, startsAt: new Date(2026, 10, 8).toISOString() })).toBeNull()
    expect(apply({ ...base, endsAt: new Date(2026, 10, 7, 14).toISOString() })).toBeNull()
    expect(apply({ ...base, daysOfWeek: [6] })).toBe("p1")
    expect(apply({ ...base, daysOfWeek: [0, 1] })).toBeNull()
    expect(apply({ ...base, startTime: "14:00", endTime: "15:00" })).toBe("p1")
    expect(apply({ ...base, startTime: "16:00", endTime: "18:00" })).toBeNull()
    // Past midnight: 22:00-15:00 covers 14:30.
    expect(apply({ ...base, startTime: "22:00", endTime: "15:00" })).toBe("p1")
  })

  it("reports a promotion's status", () => {
    expect(promotionStatus(base, now)).toBe("active")
    expect(promotionStatus({ ...base, isPaused: true }, now)).toBe("paused")
    expect(promotionStatus({ ...base, endsAt: new Date(2026, 10, 1).toISOString() }, now)).toBe(
      "expired"
    )
    expect(promotionStatus({ ...base, startsAt: new Date(2026, 11, 1).toISOString() }, now)).toBe(
      "scheduled"
    )
    expect(promotionStatus({ ...base, daysOfWeek: [0] }, now)).toBe("outsideHours")
  })
})
