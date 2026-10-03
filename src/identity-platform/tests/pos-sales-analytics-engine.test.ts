// @vitest-environment node
//
// Unit tests for PosSalesAnalyticsEngine (pos/sales-analytics-engine.ts) -- the POS equivalent of
// campaigns/analytics-engine.ts's comparePeriods/driver analysis, closing the audit's "POS 'why
// did sales decline' analysis -- CONFIRMED MISSING" gap. Uses a hand-built fake
// PosInvoicesService, same pattern as campaign-analytics-engine.test.ts, since the arithmetic
// under test here is independent of the real SQL aggregation (already tested elsewhere).

import { describe, expect, it, vi } from "vitest"

import { PosSalesAnalyticsEngine } from "../pos/sales-analytics-engine"
import type { PosInvoicesService } from "../pos/invoices-service"

function buildFakeInvoicesService() {
  const summaryMock = vi.fn()
  const topProductsMock = vi.fn()
  const invoicesService = {
    summary: summaryMock,
    topProducts: topProductsMock,
  } as unknown as PosInvoicesService
  return { invoicesService, summaryMock, topProductsMock }
}

describe("PosSalesAnalyticsEngine.comparePeriods", () => {
  it("computes revenue/orders/AOV change percentages and an exact decomposition", async () => {
    const { invoicesService, summaryMock } = buildFakeInvoicesService()
    summaryMock.mockImplementation((_orgId: string, filter: { from: string | null }) =>
      Promise.resolve(
        filter.from === "2026-09-01"
          ? {
              totalCount: 1,
              completedCount: 1,
              cancelledCount: 0,
              returnedCount: 0,
              averageCompletedValue: 400,
              totalCompletedAmount: 400,
            }
          : {
              totalCount: 4,
              completedCount: 4,
              cancelledCount: 0,
              returnedCount: 0,
              averageCompletedValue: 525,
              totalCompletedAmount: 2100,
            }
      )
    )
    const engine = new PosSalesAnalyticsEngine(invoicesService)

    const result = await engine.comparePeriods(
      "org-1",
      "workspace-1",
      {
        current: { from: "2026-09-01", to: "2026-09-03" },
        previous: { from: "2026-08-01", to: "2026-08-04" },
      },
      "UTC"
    )

    expect(result.current.revenue).toBe(400)
    expect(result.previous.revenue).toBe(2100)
    expect(result.revenueChangePercent).toBeCloseTo(-81, 0)
    expect(result.ordersChangePercent).toBe(-75)
    // Exact decomposition -- no residual.
    expect(
      Math.round((result.decomposition.orderEffect + result.decomposition.aovEffect) * 100) / 100
    ).toBe(result.current.revenue - result.previous.revenue)
    expect(result.decomposition.dominantDriver).toBe("orders")
  })

  it("flags insufficient confidence when either side has too few orders", async () => {
    const { invoicesService, summaryMock } = buildFakeInvoicesService()
    summaryMock.mockResolvedValue({
      totalCount: 1,
      completedCount: 1,
      cancelledCount: 0,
      returnedCount: 0,
      averageCompletedValue: 100,
      totalCompletedAmount: 100,
    })
    const engine = new PosSalesAnalyticsEngine(invoicesService)

    const result = await engine.comparePeriods(
      "org-1",
      null,
      {
        current: { from: "2026-09-01", to: "2026-09-01" },
        previous: { from: "2026-08-01", to: "2026-08-01" },
      },
      "UTC"
    )
    expect(result.confidence).toBe("low")
  })

  it("never produces Infinity/NaN when the previous period had zero orders", async () => {
    const { invoicesService, summaryMock } = buildFakeInvoicesService()
    summaryMock.mockImplementation((_orgId: string, filter: { from: string | null }) =>
      Promise.resolve(
        filter.from === "2026-09-01"
          ? {
              totalCount: 2,
              completedCount: 2,
              cancelledCount: 0,
              returnedCount: 0,
              averageCompletedValue: 50,
              totalCompletedAmount: 100,
            }
          : {
              totalCount: 0,
              completedCount: 0,
              cancelledCount: 0,
              returnedCount: 0,
              averageCompletedValue: 0,
              totalCompletedAmount: 0,
            }
      )
    )
    const engine = new PosSalesAnalyticsEngine(invoicesService)
    const result = await engine.comparePeriods(
      "org-1",
      null,
      {
        current: { from: "2026-09-01", to: "2026-09-02" },
        previous: { from: "2026-08-01", to: "2026-08-02" },
      },
      "UTC"
    )
    expect(result.revenueChangePercent).toBeNull()
    expect(Number.isFinite(result.decomposition.revenueChange)).toBe(true)
  })

  it("marks the current period as incomplete when its end date is today", async () => {
    const { invoicesService, summaryMock } = buildFakeInvoicesService()
    summaryMock.mockResolvedValue({
      totalCount: 10,
      completedCount: 10,
      cancelledCount: 0,
      returnedCount: 0,
      averageCompletedValue: 100,
      totalCompletedAmount: 1000,
    })
    const engine = new PosSalesAnalyticsEngine(invoicesService)
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"))
    const result = await engine.comparePeriods(
      "org-1",
      null,
      {
        current: { from: "2026-10-01", to: "2026-10-03" },
        previous: { from: "2026-09-28", to: "2026-09-30" },
      },
      "UTC"
    )
    vi.useRealTimers()
    expect(result.periodFairness.isCurrentPeriodIncomplete).toBe(true)
    expect(result.periodFairness.elapsedDays).toBe(3)
  })
})

describe("PosSalesAnalyticsEngine.getSalesPerformanceAnalysis", () => {
  it("ranks products by the most negative revenue delta first, including a product that disappeared entirely", async () => {
    const { invoicesService, summaryMock, topProductsMock } = buildFakeInvoicesService()
    summaryMock.mockResolvedValue({
      totalCount: 1,
      completedCount: 1,
      cancelledCount: 0,
      returnedCount: 0,
      averageCompletedValue: 100,
      totalCompletedAmount: 100,
    })
    topProductsMock.mockImplementation((_orgId: string, filter: { from: string | null }) =>
      Promise.resolve(
        filter.from === "2026-09-01"
          ? [
              {
                productId: "p1",
                productName: "Product A",
                quantitySold: 1,
                revenue: 100,
                invoiceCount: 1,
              },
            ]
          : [
              {
                productId: "p1",
                productName: "Product A",
                quantitySold: 5,
                revenue: 500,
                invoiceCount: 5,
              },
              {
                productId: "p2",
                productName: "Product B",
                quantitySold: 3,
                revenue: 300,
                invoiceCount: 3,
              },
            ]
      )
    )
    const engine = new PosSalesAnalyticsEngine(invoicesService)

    const result = await engine.getSalesPerformanceAnalysis(
      "org-1",
      null,
      {
        current: { from: "2026-09-01", to: "2026-09-30" },
        previous: { from: "2026-08-01", to: "2026-08-31" },
      },
      "UTC"
    )

    // Product A: 100 - 500 = -400; Product B: 0 - 300 = -300 (disappeared from the current
    // period entirely) -- Product A is the larger decline, so it sorts first.
    expect(result.productContributions[0].productName).toBe("Product A")
    expect(result.productContributions[0].revenueDelta).toBe(-400)
    const productB = result.productContributions.find((p) => p.productName === "Product B")
    expect(productB?.currentRevenue).toBe(0)
    expect(productB?.previousRevenue).toBe(300)
    expect(productB?.revenueDelta).toBe(-300)
  })

  it("caps the contribution list at 5 products", async () => {
    const { invoicesService, summaryMock, topProductsMock } = buildFakeInvoicesService()
    summaryMock.mockResolvedValue({
      totalCount: 1,
      completedCount: 1,
      cancelledCount: 0,
      returnedCount: 0,
      averageCompletedValue: 100,
      totalCompletedAmount: 100,
    })
    const manyProducts = Array.from({ length: 10 }, (_, i) => ({
      productId: `p${i}`,
      productName: `Product ${i}`,
      quantitySold: 1,
      revenue: 100 - i,
      invoiceCount: 1,
    }))
    topProductsMock.mockResolvedValue(manyProducts)
    const engine = new PosSalesAnalyticsEngine(invoicesService)

    const result = await engine.getSalesPerformanceAnalysis(
      "org-1",
      null,
      {
        current: { from: "2026-09-01", to: "2026-09-30" },
        previous: { from: "2026-08-01", to: "2026-08-31" },
      },
      "UTC"
    )
    expect(result.productContributions).toHaveLength(5)
  })
})
