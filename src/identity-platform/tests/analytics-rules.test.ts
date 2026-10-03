// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  decomposeRevenueChange,
  describePeriodFairness,
  isPeriodIncomplete,
} from "../shared/analytics-rules"

describe("isPeriodIncomplete", () => {
  it("is true when the period ends on today's date in the organization's timezone", () => {
    const now = new Date("2026-10-03T12:00:00Z")
    expect(isPeriodIncomplete({ from: "2026-10-01", to: "2026-10-03" }, "UTC", now)).toBe(true)
  })

  it("is false when the period ends before today", () => {
    const now = new Date("2026-10-03T12:00:00Z")
    expect(isPeriodIncomplete({ from: "2026-09-01", to: "2026-09-30" }, "UTC", now)).toBe(false)
  })

  it("respects the organization's own timezone, not UTC", () => {
    // 2026-10-03T22:30:00Z is already 2026-10-04 local in Asia/Riyadh (+3).
    const now = new Date("2026-10-03T22:30:00Z")
    expect(isPeriodIncomplete({ from: "2026-10-01", to: "2026-10-04" }, "Asia/Riyadh", now)).toBe(
      true
    )
    expect(isPeriodIncomplete({ from: "2026-10-01", to: "2026-10-03" }, "Asia/Riyadh", now)).toBe(
      false
    )
  })
})

describe("describePeriodFairness", () => {
  it("reports the elapsed day count and incompleteness together", () => {
    const now = new Date("2026-10-03T12:00:00Z")
    const note = describePeriodFairness({ from: "2026-10-01", to: "2026-10-03" }, "UTC", now)
    expect(note.isCurrentPeriodIncomplete).toBe(true)
    expect(note.elapsedDays).toBe(3)
  })
})

describe("decomposeRevenueChange", () => {
  it("exactly reconstructs the real revenue change with no residual", () => {
    const result = decomposeRevenueChange({ orders: 1, aov: 400 }, { orders: 4, aov: 525 })
    // 1*400 - 4*525 = 400 - 2100 = -1700
    expect(result.revenueChange).toBe(-1700)
    expect(Math.round((result.orderEffect + result.aovEffect) * 100) / 100).toBe(
      result.revenueChange
    )
  })

  it("attributes the decline mostly to order volume when orders dropped sharply but AOV barely moved", () => {
    const result = decomposeRevenueChange({ orders: 1, aov: 400 }, { orders: 4, aov: 525 })
    expect(result.dominantDriver).toBe("orders")
    expect(result.orderEffectPercent).toBeGreaterThan(result.aovEffectPercent!)
  })

  it("attributes the change mostly to AOV when order count is unchanged", () => {
    const result = decomposeRevenueChange({ orders: 10, aov: 80 }, { orders: 10, aov: 100 })
    expect(result.orderEffect).toBe(0)
    expect(result.dominantDriver).toBe("aov")
    expect(result.aovEffectPercent).toBe(100)
  })

  it("returns dominantDriver 'none' and null percentages when nothing changed", () => {
    const result = decomposeRevenueChange({ orders: 10, aov: 100 }, { orders: 10, aov: 100 })
    expect(result.revenueChange).toBe(0)
    expect(result.dominantDriver).toBe("none")
    expect(result.orderEffectPercent).toBeNull()
    expect(result.aovEffectPercent).toBeNull()
  })

  it("classifies a genuinely mixed change as 'both'", () => {
    // orderEffect and aovEffect close to equal magnitude.
    const result = decomposeRevenueChange({ orders: 9, aov: 90 }, { orders: 10, aov: 100 })
    // orderEffect = (9-10)*100 = -100; aovEffect = 9*(90-100) = -90; ratio ~0.526 -> "both"
    expect(result.dominantDriver).toBe("both")
  })
})
