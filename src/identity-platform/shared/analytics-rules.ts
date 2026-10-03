import { currentLocalDateParts } from "./timezone"

// Deterministic, framework-agnostic business rules shared by every analytics domain
// (advertising, POS, e-commerce) -- the "backend rules engine" layer the Genie-upgrade audit
// found missing. These are pure functions with no DB/LLM access: period fairness and
// formula-based metric decomposition belong here, not scattered inline in each domain's own
// engine, and never delegated to the LLM (see ai-chat/service.ts's PRESENTATION_RULES and
// ADVERTISING_ANALYTICS_RULES for the matching "never compute this yourself" prompt-side rule).

export interface SimpleDateRange {
  from: string
  to: string
}

function isoToday(timezone: string, now: Date): string {
  const parts = currentLocalDateParts(timezone, now)
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

function daysBetweenInclusive(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000)) + 1
}

// True when a period's end date is "today" in the organization's own timezone -- the period
// hasn't fully elapsed yet. Audit finding: `resolveRelativePeriod("this_month", ...)` already
// returns a range truncated to today (1st -> today, not 1st -> end of month), and
// `precedingPeriod`/`defaultComparisonRanges` already mirror that exact elapsed-day span for the
// comparison side -- the arithmetic was already fair. What was missing is surfacing that fact: a
// user comparing "this month" on day 3 has no way to know the tool quietly used a 3-day previous
// window instead of a full previous month. This is the one piece of metadata that was missing.
export function isPeriodIncomplete(
  range: SimpleDateRange,
  timezone: string,
  now: Date = new Date()
): boolean {
  return range.to === isoToday(timezone, now)
}

export interface PeriodFairnessNote {
  isCurrentPeriodIncomplete: boolean
  elapsedDays: number
}

// Describes the current period's completeness and span -- never re-derives or overrides the
// ranges a caller already computed (that stays `precedingPeriod`'s job); this only produces the
// honesty note the response layer attaches ("the comparison uses the same elapsed number of days
// in both periods") instead of silently comparing partial-vs-full periods.
export function describePeriodFairness(
  current: SimpleDateRange,
  timezone: string,
  now: Date = new Date()
): PeriodFairnessNote {
  return {
    isCurrentPeriodIncomplete: isPeriodIncomplete(current, timezone, now),
    elapsedDays: daysBetweenInclusive(current.from, current.to),
  }
}

export interface RevenueDecomposition {
  // Matches current.revenue - previous.revenue exactly (orderEffect + aovEffect sums to this --
  // no unexplained residual), using the standard exact two-factor decomposition of
  // Revenue = Orders x AOV: the "volume effect" is priced at the PREVIOUS period's AOV, and the
  // "price effect" is weighted by the CURRENT period's order count.
  revenueChange: number
  orderEffect: number
  aovEffect: number
  // Each effect's share of the total magnitude of change -- null when there was no change at all
  // (both effects are zero), since a percentage of zero is not a meaningful "share."
  orderEffectPercent: number | null
  aovEffectPercent: number | null
  dominantDriver: "orders" | "aov" | "both" | "none"
}

// Revenue = Orders x AOV. Never treat "invoice count dropped" as the whole story (the spec's own
// complaint about shallow answers) -- decompose into how much of the revenue change is explained
// by order-volume vs. average-order-value movement. Pure arithmetic on two already-computed
// snapshots; never calls a tool or invents a number itself.
export function decomposeRevenueChange(
  current: { orders: number; aov: number },
  previous: { orders: number; aov: number }
): RevenueDecomposition {
  const orderEffect = Math.round((current.orders - previous.orders) * previous.aov * 100) / 100
  const aovEffect = Math.round(current.orders * (current.aov - previous.aov) * 100) / 100
  const revenueChange = Math.round((orderEffect + aovEffect) * 100) / 100
  const totalAbs = Math.abs(orderEffect) + Math.abs(aovEffect)

  if (totalAbs === 0) {
    return {
      revenueChange,
      orderEffect,
      aovEffect,
      orderEffectPercent: null,
      aovEffectPercent: null,
      dominantDriver: "none",
    }
  }

  const orderRatio = Math.abs(orderEffect) / totalAbs
  const dominantDriver: RevenueDecomposition["dominantDriver"] =
    orderRatio >= 0.65 ? "orders" : orderRatio <= 0.35 ? "aov" : "both"

  return {
    revenueChange,
    orderEffect,
    aovEffect,
    orderEffectPercent: Math.round(orderRatio * 1000) / 10,
    aovEffectPercent: Math.round((1 - orderRatio) * 1000) / 10,
    dominantDriver,
  }
}
