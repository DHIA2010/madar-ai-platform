import { describe, expect, it } from "vitest"

import type { Promotion } from "../types/promotion.types"
import { bestPromotionFor, promotionStatus, promotionUnitDiscount } from "./promotion-engine"

const base: Promotion = {
  id: "p1",
  name: "عرض",
  discountType: "percent",
  discountValue: 10,
  maxDiscountPerUnit: null,
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
    expect(promotionUnitDiscount(base, 115)).toBeCloseTo(11.5)
    expect(promotionUnitDiscount({ ...base, maxDiscountPerUnit: 5 }, 115)).toBe(5)
    expect(promotionUnitDiscount({ ...base, discountType: "fixed", discountValue: 20 }, 115)).toBe(
      20
    )
    expect(promotionUnitDiscount({ ...base, discountType: "fixed", discountValue: 200 }, 115)).toBe(
      115
    )
  })

  it("converts a VAT-inclusive line's discount to net", () => {
    // 10% of 115 = 11.50 per unit, x2 = 23.00 gross = 20.00 net.
    expect(bestPromotionFor([base], line, now, "ws-1")?.netDiscount).toBe(20)
    expect(
      bestPromotionFor([base], { ...line, priceIncludesTax: false }, now, "ws-1")?.netDiscount
    ).toBe(23)
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
