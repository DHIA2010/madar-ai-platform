import { decomposeRevenueChange, describePeriodFairness } from "../shared/analytics-rules"
import type { PeriodFairnessNote, RevenueDecomposition } from "../shared/analytics-rules"
import type { PosInvoicesService } from "./invoices-service"

// A deterministic POS equivalent of campaigns/analytics-engine.ts's comparePeriods +
// identifyPerformanceDrivers, closing the audit's "POS 'why did sales decline' analysis --
// CONFIRMED MISSING" gap. Deliberately NOT importing campaigns/confidence-engine.ts -- POS has no
// spend/clicks dimension to gate on, so it needs its own sample-size bands (orders + days), kept
// local here the same way APPLICATION_SETTINGS_KEY is duplicated per-module elsewhere in this
// codebase rather than forcing an ad-specific shape onto a different domain.

export type PosConfidenceLevel = "high" | "medium" | "low" | "insufficient"

interface PosSampleSize {
  orders: number
  days: number
}

const POS_CONFIDENCE_THRESHOLDS = {
  high: { minOrders: 20, minDays: 7 },
  medium: { minOrders: 5, minDays: 3 },
  low: { minOrders: 1, minDays: 1 },
} as const

function computePosConfidence(sample: PosSampleSize): PosConfidenceLevel {
  if (
    sample.orders >= POS_CONFIDENCE_THRESHOLDS.high.minOrders &&
    sample.days >= POS_CONFIDENCE_THRESHOLDS.high.minDays
  )
    return "high"
  if (
    sample.orders >= POS_CONFIDENCE_THRESHOLDS.medium.minOrders &&
    sample.days >= POS_CONFIDENCE_THRESHOLDS.medium.minDays
  )
    return "medium"
  if (
    sample.orders >= POS_CONFIDENCE_THRESHOLDS.low.minOrders &&
    sample.days >= POS_CONFIDENCE_THRESHOLDS.low.minDays
  )
    return "low"
  return "insufficient"
}

function combinePosConfidence(a: PosConfidenceLevel, b: PosConfidenceLevel): PosConfidenceLevel {
  const order: PosConfidenceLevel[] = ["insufficient", "low", "medium", "high"]
  return order[Math.min(order.indexOf(a), order.indexOf(b))]
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1)
}

// null (not Infinity/NaN) when previous is 0, matching campaigns/analytics-engine.ts's own
// pctChange convention -- a 0->X change has no defined percentage, that's a real fact to report,
// not an error to paper over. 0 (not null) when both sides are 0 -- no change happened.
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export interface PosPeriodRange {
  from: string
  to: string
}

export interface PosSalesSnapshot {
  revenue: number
  orders: number
  aov: number
}

export interface PosSalesComparisonResult {
  period: { current: PosPeriodRange; previous: PosPeriodRange }
  current: PosSalesSnapshot
  previous: PosSalesSnapshot
  revenueChangePercent: number | null
  ordersChangePercent: number | null
  aovChangePercent: number | null
  decomposition: RevenueDecomposition
  confidence: PosConfidenceLevel
  periodFairness: PeriodFairnessNote
}

export interface PosProductContribution {
  productId: string | null
  productName: string
  currentRevenue: number
  previousRevenue: number
  revenueDelta: number
}

export interface PosSalesPerformanceAnalysis {
  comparison: PosSalesComparisonResult
  // Sorted most-negative-delta first -- directly answers "which products are responsible for the
  // decline" (spec's own example question). A product with no matching previous-period row is
  // treated as previousRevenue: 0 (genuinely new, not a comparison against nothing being skipped --
  // unlike campaign declines, a POS product list is small enough that this is still informative).
  productContributions: PosProductContribution[]
}

export class PosSalesAnalyticsEngine {
  constructor(private readonly invoicesService: PosInvoicesService) {}

  async comparePeriods(
    organizationId: string,
    workspaceId: string | null,
    ranges: { current: PosPeriodRange; previous: PosPeriodRange },
    timezone: string
  ): Promise<PosSalesComparisonResult> {
    const [currentSummary, previousSummary] = await Promise.all([
      this.invoicesService.summary(organizationId, {
        workspaceId,
        status: null,
        paymentMethodCode: null,
        from: ranges.current.from,
        to: ranges.current.to,
      }),
      this.invoicesService.summary(organizationId, {
        workspaceId,
        status: null,
        paymentMethodCode: null,
        from: ranges.previous.from,
        to: ranges.previous.to,
      }),
    ])

    const current: PosSalesSnapshot = {
      revenue: currentSummary.totalCompletedAmount,
      orders: currentSummary.completedCount,
      aov: currentSummary.averageCompletedValue,
    }
    const previous: PosSalesSnapshot = {
      revenue: previousSummary.totalCompletedAmount,
      orders: previousSummary.completedCount,
      aov: previousSummary.averageCompletedValue,
    }

    const confidence = combinePosConfidence(
      computePosConfidence({
        orders: current.orders,
        days: daysBetween(ranges.current.from, ranges.current.to),
      }),
      computePosConfidence({
        orders: previous.orders,
        days: daysBetween(ranges.previous.from, ranges.previous.to),
      })
    )

    return {
      period: ranges,
      current,
      previous,
      revenueChangePercent: pctChange(current.revenue, previous.revenue),
      ordersChangePercent: pctChange(current.orders, previous.orders),
      aovChangePercent: pctChange(current.aov, previous.aov),
      decomposition: decomposeRevenueChange(current, previous),
      confidence,
      periodFairness: describePeriodFairness(ranges.current, timezone),
    }
  }

  // analyze_sales_performance -- the composite "why" answer: comparison + decomposition (already
  // inside comparePeriods) + which products contributed most to the change. Never stops at "order
  // count dropped" the way a bare summary() call would.
  async getSalesPerformanceAnalysis(
    organizationId: string,
    workspaceId: string | null,
    ranges: { current: PosPeriodRange; previous: PosPeriodRange },
    timezone: string
  ): Promise<PosSalesPerformanceAnalysis> {
    const [comparison, currentProducts, previousProducts] = await Promise.all([
      this.comparePeriods(organizationId, workspaceId, ranges, timezone),
      this.invoicesService.topProducts(organizationId, {
        workspaceId,
        from: ranges.current.from,
        to: ranges.current.to,
        limit: 20,
      }),
      this.invoicesService.topProducts(organizationId, {
        workspaceId,
        from: ranges.previous.from,
        to: ranges.previous.to,
        limit: 20,
      }),
    ])

    // Match by productId first -- a renamed product (typo fix, casing change, re-categorization)
    // must still be treated as the SAME product across periods, not reported as one dropped
    // product plus one brand-new product. Only falls back to matching by name when productId is
    // null (a free-text invoice line with no catalog product behind it), which is the one case
    // where id-based matching isn't possible at all.
    const previousById = new Map<string, (typeof previousProducts)[number]>()
    const previousByName = new Map<string, (typeof previousProducts)[number]>()
    for (const row of previousProducts) {
      if (row.productId) previousById.set(row.productId, row)
      else previousByName.set(row.productName, row)
    }
    const matchedPreviousKeys = new Set<string>()
    const productContributions: PosProductContribution[] = []
    for (const row of currentProducts) {
      const previousRow = row.productId
        ? previousById.get(row.productId)
        : previousByName.get(row.productName)
      if (previousRow) {
        matchedPreviousKeys.add(previousRow.productId ?? `name:${previousRow.productName}`)
      }
      productContributions.push({
        productId: row.productId,
        productName: row.productName,
        currentRevenue: row.revenue,
        previousRevenue: previousRow?.revenue ?? 0,
        revenueDelta: Math.round((row.revenue - (previousRow?.revenue ?? 0)) * 100) / 100,
      })
    }
    // A product that sold in the previous period but not at all in the current one is itself
    // evidence for a decline -- it must not silently disappear just because it has no "current"
    // row to anchor the loop above.
    for (const row of previousProducts) {
      const key = row.productId ?? `name:${row.productName}`
      if (matchedPreviousKeys.has(key)) continue
      productContributions.push({
        productId: row.productId,
        productName: row.productName,
        currentRevenue: 0,
        previousRevenue: row.revenue,
        revenueDelta: Math.round(-row.revenue * 100) / 100,
      })
    }
    productContributions.sort((a, b) => a.revenueDelta - b.revenueDelta)

    return { comparison, productContributions: productContributions.slice(0, 5) }
  }
}
