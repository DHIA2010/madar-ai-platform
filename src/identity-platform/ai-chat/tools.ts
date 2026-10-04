import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import {
  defaultComparisonRanges,
  type CampaignAnalyticsEngine,
} from "../campaigns/analytics-engine"
import type { MetricKey } from "../campaigns/analytics-types"
import { METRIC_DEFINITIONS, UNAVAILABLE_METRICS_NOTE } from "../campaigns/metric-definitions"
import type { CampaignsPerformanceAggregationService } from "../campaigns/performance-service"
import {
  generateAccountRecommendation,
  generateContributionRecommendations,
} from "../campaigns/recommendation-engine"
import type { ChannelsAggregationService } from "../channels/channels-service"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { OrdersAggregationService } from "../orders/service"
import type { PosInvoicesService } from "../pos/invoices-service"
import type { PosSalesAnalyticsEngine } from "../pos/sales-analytics-engine"
import type { PosShiftsService } from "../pos/shifts-service"
import { findDataSource } from "../reports/catalog"
import type { ReportsService } from "../reports/service"
import { describePeriodFairness } from "../shared/analytics-rules"
import {
  getOrganizationTimezone,
  precedingPeriod,
  RELATIVE_PERIODS,
  resolveRelativePeriod,
  type RelativePeriod,
} from "../shared/date-range-resolver"
import type { StoresAggregationService } from "../stores/service"

import type { ApplicationCategoryId } from "./types"

export interface AiChatToolServices {
  db: PostgresDatabase
  campaignPerformanceService: CampaignsPerformanceAggregationService
  channelsService: ChannelsAggregationService
  campaignAnalyticsEngine: CampaignAnalyticsEngine
  ordersAggregationService: OrdersAggregationService
  storesAggregationService: StoresAggregationService
  posInvoicesService: PosInvoicesService
  posShiftsService: PosShiftsService
  posSalesAnalyticsEngine: PosSalesAnalyticsEngine
  reportsService: ReportsService
}

const relativePeriodProperty = {
  type: "string",
  enum: RELATIVE_PERIODS as unknown as string[],
  description:
    "A named relative period (resolved deterministically server-side in the org's own timezone) -- prefer this over startDate/endDate whenever the user's question matches one of these phrases exactly (e.g. 'this week', 'last month'). Takes precedence over startDate/endDate if both are given. Use 'all_time' whenever the user means the entire available history (e.g. 'all time', 'from the beginning', 'كل الوقت', 'من البداية', 'منذ إنشاء الحساب') -- it resolves to the real earliest-to-latest date range actually present in the data, never a guessed date. Never ask the user to clarify the period when one of these phrases already names it.",
} as const

type AnalyticsDomain = "advertising" | "pos" | "ecommerce"

// "all time" has no fixed [from, to] computable from "now" -- it needs the real earliest/latest
// date actually present in this specific domain's own data (never assumed, e.g., as "since the
// business was created"). Each domain's own service already knows how to find that (reusing its
// existing multi-platform/multi-provider row-fetching rather than hand-rolling parallel SQL per
// schema -- see each getDateCoverage's own comment). Falls back to "today" on both ends only when
// a domain genuinely has zero rows yet, so the underlying query still runs (and correctly returns
// nothing) instead of being left with undefined dates.
async function resolveAllTimeRange(
  actor: AuthenticatedActor,
  services: AiChatToolServices,
  domain: AnalyticsDomain
): Promise<{ from: string; to: string }> {
  const today = new Date().toISOString().slice(0, 10)
  const coverage =
    domain === "advertising"
      ? await services.campaignPerformanceService.getDateCoverage(actor)
      : domain === "pos"
        ? await services.posInvoicesService.getDateCoverage(actor.organizationId, actor.workspaceId)
        : await services.ordersAggregationService.getDateCoverage(actor)
  const to = coverage.latestDate ?? today
  // Every downstream query compares `created_at <= $to` with `to` as a bare date (implicit
  // midnight), so a record timestamped later than 00:00 on the latest coverage day would
  // otherwise be silently excluded -- the exact opposite of "all time" actually meaning all of
  // it. Push the upper bound one day forward so the whole latest day is included; `from` still
  // reports the real earliest date untouched. (The one acceptable side effect: a reported
  // "to" date one calendar day past the true latest transaction, never a lost transaction.)
  const toInclusive = new Date(`${to}T00:00:00Z`)
  toInclusive.setUTCDate(toInclusive.getUTCDate() + 1)
  return { from: coverage.earliestDate ?? today, to: toInclusive.toISOString().slice(0, 10) }
}

// Deterministic date resolution (never the model doing date arithmetic itself) -- if `period` is
// given, resolves it server-side in the organization's own timezone; otherwise falls back to
// whatever explicit startDate/endDate the model supplied (or the underlying service's own
// default window, if neither is given). `isAllTime` lets a caller attach the resolved range to
// its own tool output as `queriedPeriod`, so the model can tell the user what "all time" actually
// covered instead of leaving them to guess.
async function resolveSinglePeriod(
  services: AiChatToolServices,
  domain: AnalyticsDomain,
  actor: AuthenticatedActor,
  input: { period?: RelativePeriod; startDate?: string; endDate?: string }
): Promise<{ startDate?: string; endDate?: string; isAllTime: boolean }> {
  if (input.period === "all_time") {
    const range = await resolveAllTimeRange(actor, services, domain)
    return { startDate: range.from, endDate: range.to, isAllTime: true }
  }
  if (input.period) {
    const timezone = await getOrganizationTimezone(services.db, actor.organizationId)
    const range = resolveRelativePeriod(input.period, timezone)
    return { startDate: range.from, endDate: range.to, isAllTime: false }
  }
  return { startDate: input.startDate, endDate: input.endDate, isAllTime: false }
}

// Attaches the real resolved date range to a tool's own result object -- the only way the model
// (and, through it, the user) can learn what "all time" actually covered, since
// CampaignPerformanceSummary/InvoiceSummary/etc. don't otherwise echo back which dates were
// queried. Additive, never overwrites an existing field.
function withQueriedPeriod<T extends object>(
  resolved: { startDate?: string; endDate?: string },
  result: T
): T & { queriedPeriod: { from: string; to: string } | null } {
  return {
    ...result,
    queriedPeriod:
      resolved.startDate && resolved.endDate
        ? { from: resolved.startDate, to: resolved.endDate }
        : null,
  }
}

// Same idea for a two-period comparison -- `currentPeriod` resolves both sides (the previous side
// via precedingPeriod, an equal-length window immediately before) unless explicit dates override
// it. "all time vs. the period before it" isn't a meaningful comparison (there IS no "before" the
// earliest data), so an all-time current period resolves `previous` to the single day right
// before the earliest date -- genuinely empty, which honestly reports "no prior data" rather than
// fabricating a comparison window.
async function resolveComparisonPeriods(
  services: AiChatToolServices,
  domain: AnalyticsDomain,
  actor: AuthenticatedActor,
  input: {
    currentPeriod?: RelativePeriod
    currentFrom?: string
    currentTo?: string
    previousFrom?: string
    previousTo?: string
  }
): Promise<{
  current: { from: string; to: string }
  previous: { from: string; to: string }
  isAllTime: boolean
}> {
  if (input.currentPeriod === "all_time") {
    const range = await resolveAllTimeRange(actor, services, domain)
    const dayBefore = new Date(new Date(`${range.from}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    return {
      current: { from: range.from, to: range.to },
      previous: { from: dayBefore, to: dayBefore },
      isAllTime: true,
    }
  }
  if (input.currentPeriod) {
    const timezone = await getOrganizationTimezone(services.db, actor.organizationId)
    const current = resolveRelativePeriod(input.currentPeriod, timezone)
    const previous = precedingPeriod(current)
    return {
      current: { from: current.from, to: current.to },
      previous: { from: input.previousFrom ?? previous.from, to: input.previousTo ?? previous.to },
      isAllTime: false,
    }
  }
  return { ...resolveRanges(input), isAllTime: false }
}

const RANKABLE_METRICS = [
  "spend",
  "revenue",
  "roas",
  "clicks",
  "conversions",
  "cpa",
  "ctr",
] as const satisfies readonly MetricKey[]

function resolveRanges(input: {
  currentFrom?: string
  currentTo?: string
  previousFrom?: string
  previousTo?: string
}) {
  const defaults = defaultComparisonRanges({
    currentFrom: input.currentFrom,
    currentTo: input.currentTo,
  })
  return {
    current: {
      from: input.currentFrom ?? defaults.current.from,
      to: input.currentTo ?? defaults.current.to,
    },
    previous: {
      from: input.previousFrom ?? defaults.previous.from,
      to: input.previousTo ?? defaults.previous.to,
    },
  }
}

interface ToolDefinition {
  category: ApplicationCategoryId
  tool: Anthropic.Tool
  schema: z.ZodType
  execute: (
    actor: AuthenticatedActor,
    services: AiChatToolServices,
    input: Record<string, unknown>
  ) => Promise<unknown>
}

const dateRangeShape = {
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}

const dateRangeProperties = {
  startDate: {
    type: "string",
    description: "ISO date, e.g. 2026-09-01. Omit for the default window.",
  },
  endDate: {
    type: "string",
    description: "ISO date, e.g. 2026-09-30. Omit for the default window.",
  },
} as const

// One tool per real, already-tested aggregation method -- the model only ever narrates numbers
// these services compute, never computes one itself. Each tool is declared under exactly one
// ApplicationCategoryId; buildToolsForCategory only ever returns the tools for the session's own
// single category, which is the actual enforcement mechanism (see ai-chat/service.ts).
const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    category: "advertising",
    tool: {
      name: "get_metric_definitions",
      description:
        "Returns the exact formula, data source, and null-handling rule for every advertising metric this system computes (ROAS, CPA, CTR, CPC, CPM, conversion rate, spend, revenue). Call this whenever the user asks how a metric is calculated or defined -- never explain a formula from memory.",
      input_schema: { type: "object", properties: {} },
    },
    schema: z.object({}),
    execute: async () => ({ metrics: METRIC_DEFINITIONS, unavailable: UNAVAILABLE_METRICS_NOTE }),
  },
  {
    category: "advertising",
    tool: {
      name: "get_campaign_summary",
      description:
        "Real ad account summary for an optional date range: spend, revenue, ROAS, impressions, clicks, CTR, CPC, CPM, conversions, conversion rate, CPA, active campaign count -- plus data freshness per channel and a confidence level based on sample size. Reach/frequency/creative/audience/geo/device breakdowns are not available at this level -- say so if asked, never estimate them.",
      input_schema: {
        type: "object",
        properties: { ...dateRangeProperties, period: relativePeriodProperty },
      },
    },
    schema: z.object({ ...dateRangeShape, period: z.enum(RELATIVE_PERIODS).optional() }),
    execute: async (actor, services, input) => {
      const parsed = input as { startDate?: string; endDate?: string; period?: RelativePeriod }
      const resolved = await resolveSinglePeriod(services, "advertising", actor, parsed)
      const summary = await services.campaignAnalyticsEngine.getCampaignSummary(actor, resolved)
      return withQueriedPeriod(resolved, summary)
    },
  },
  {
    category: "advertising",
    tool: {
      name: "compare_campaign_periods",
      description:
        "Deterministic before/after comparison of the account-wide summary between two periods (defaults to this-30-days vs previous-30-days if no period/dates are given). Returns raw current/previous values, percentage change, and a confidence level -- never calculate these percentages yourself, always call this tool. Prefer currentPeriod over currentFrom/currentTo whenever the question names a relative phrase ('this month', 'last week').",
      input_schema: {
        type: "object",
        properties: {
          currentPeriod: relativePeriodProperty,
          currentFrom: {
            type: "string",
            description:
              "ISO date, start of the period to analyze. Ignored if currentPeriod is set.",
          },
          currentTo: {
            type: "string",
            description: "ISO date, end of the period to analyze. Ignored if currentPeriod is set.",
          },
          previousFrom: {
            type: "string",
            description:
              "ISO date, start of the comparison period. Omit to use the equal-length period immediately before the current period.",
          },
          previousTo: { type: "string", description: "ISO date, end of the comparison period." },
        },
      },
    },
    schema: z.object({
      currentPeriod: z.enum(RELATIVE_PERIODS).optional(),
      currentFrom: z.string().optional(),
      currentTo: z.string().optional(),
      previousFrom: z.string().optional(),
      previousTo: z.string().optional(),
    }),
    execute: async (actor, services, input) => {
      const ranges = await resolveComparisonPeriods(
        services,
        "advertising",
        actor,
        input as {
          currentPeriod?: RelativePeriod
          currentFrom?: string
          currentTo?: string
          previousFrom?: string
          previousTo?: string
        }
      )
      return services.campaignAnalyticsEngine.comparePeriods(actor, ranges)
    },
  },
  {
    category: "advertising",
    tool: {
      name: "get_channel_comparison",
      description:
        "Real per-channel comparison (Google Ads, Meta Ads, TikTok Ads, Snapchat) for an optional date range -- spend, revenue, ROAS, CPA, CTR, CPC, conversion rate, conversions, plus sync freshness and confidence per channel. Only returns channels actually connected with campaigns in range.",
      input_schema: {
        type: "object",
        properties: { ...dateRangeProperties, period: relativePeriodProperty },
      },
    },
    schema: z.object({ ...dateRangeShape, period: z.enum(RELATIVE_PERIODS).optional() }),
    execute: async (actor, services, input) => {
      const parsed = input as { startDate?: string; endDate?: string; period?: RelativePeriod }
      const resolved = await resolveSinglePeriod(services, "advertising", actor, parsed)
      return services.campaignAnalyticsEngine.getChannelComparison(actor, resolved)
    },
  },
  {
    category: "advertising",
    tool: {
      name: "get_top_campaigns",
      description:
        "Deterministic campaign ranking by a chosen metric, best ('top') or worst ('bottom') first. Campaigns with too little data (spend/clicks/conversions/days below reliability thresholds) are automatically excluded from ranking -- never ranked as 'best'/'worst' on a tiny sample.",
      input_schema: {
        type: "object",
        properties: {
          ...dateRangeProperties,
          period: relativePeriodProperty,
          metric: { type: "string", enum: RANKABLE_METRICS as unknown as string[] },
          direction: { type: "string", enum: ["top", "bottom"] },
          limit: { type: "number", description: "Max rows to return, default 5, max 20." },
        },
        required: ["metric", "direction"],
      },
    },
    schema: z.object({
      ...dateRangeShape,
      period: z.enum(RELATIVE_PERIODS).optional(),
      metric: z.enum(RANKABLE_METRICS),
      direction: z.enum(["top", "bottom"]),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (actor, services, input) => {
      const parsed = input as {
        startDate?: string
        endDate?: string
        period?: RelativePeriod
        metric: MetricKey
        direction: "top" | "bottom"
        limit?: number
      }
      const resolved = await resolveSinglePeriod(services, "advertising", actor, parsed)
      return services.campaignAnalyticsEngine.getCampaignRanking(actor, {
        query: resolved,
        metric: parsed.metric,
        direction: parsed.direction,
        limit: parsed.limit ?? 5,
      })
    },
  },
  {
    category: "advertising",
    tool: {
      name: "get_campaign_declines",
      description:
        "Deterministic list of campaigns whose chosen metric got WORSE between a current and previous period (joined by campaign id -- new/ended campaigns with no matching period are excluded, since that's not a real trend). Each row includes before/after values and a confidence level.",
      input_schema: {
        type: "object",
        properties: {
          currentPeriod: relativePeriodProperty,
          currentFrom: { type: "string" },
          currentTo: { type: "string" },
          previousFrom: { type: "string" },
          previousTo: { type: "string" },
          metric: { type: "string", enum: RANKABLE_METRICS as unknown as string[] },
          limit: { type: "number", description: "Max rows to return, default 5, max 20." },
        },
        required: ["metric"],
      },
    },
    schema: z.object({
      currentPeriod: z.enum(RELATIVE_PERIODS).optional(),
      currentFrom: z.string().optional(),
      currentTo: z.string().optional(),
      previousFrom: z.string().optional(),
      previousTo: z.string().optional(),
      metric: z.enum(RANKABLE_METRICS),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (actor, services, input) => {
      const parsed = input as {
        currentPeriod?: RelativePeriod
        currentFrom?: string
        currentTo?: string
        previousFrom?: string
        previousTo?: string
        metric: MetricKey
        limit?: number
      }
      const ranges = await resolveComparisonPeriods(services, "advertising", actor, parsed)
      return services.campaignAnalyticsEngine.getCampaignDeclines(actor, {
        ranges,
        metric: parsed.metric,
        limit: parsed.limit ?? 5,
      })
    },
  },
  {
    category: "advertising",
    tool: {
      name: "get_campaign_anomalies",
      description:
        "Deterministic, threshold-based anomaly flags: stale data sync, sudden spend spike/drop per channel, and per-campaign ROAS drop / CPA spike / CTR collapse / CPC spike / conversion-rate drop beyond a fixed percentage threshold. Not machine-learning based -- transparent fixed rules only.",
      input_schema: { type: "object", properties: {} },
    },
    schema: z.object({}),
    execute: (actor, services) => services.campaignAnalyticsEngine.detectAnomalies(actor),
  },
  {
    category: "advertising",
    tool: {
      name: "identify_performance_drivers",
      description:
        "Given a target metric (e.g. roas), deterministically ranks which OTHER metrics changed the most between two periods and in which direction. Returns hedged, non-causal observations ('the largest observed change is...', 'appears associated with') -- never a definitive cause. Call compare_campaign_periods first if you need the raw before/after numbers too.",
      input_schema: {
        type: "object",
        properties: {
          currentPeriod: relativePeriodProperty,
          currentFrom: { type: "string" },
          currentTo: { type: "string" },
          previousFrom: { type: "string" },
          previousTo: { type: "string" },
          metric: { type: "string", enum: RANKABLE_METRICS as unknown as string[] },
        },
        required: ["metric"],
      },
    },
    schema: z.object({
      currentPeriod: z.enum(RELATIVE_PERIODS).optional(),
      currentFrom: z.string().optional(),
      currentTo: z.string().optional(),
      previousFrom: z.string().optional(),
      previousTo: z.string().optional(),
      metric: z.enum(RANKABLE_METRICS),
    }),
    execute: async (actor, services, input) => {
      const parsed = input as {
        currentPeriod?: RelativePeriod
        currentFrom?: string
        currentTo?: string
        previousFrom?: string
        previousTo?: string
        metric: MetricKey
      }
      const ranges = await resolveComparisonPeriods(services, "advertising", actor, parsed)
      const comparison = await services.campaignAnalyticsEngine.comparePeriods(actor, ranges)
      return {
        comparison,
        drivers: services.campaignAnalyticsEngine.identifyPerformanceDrivers(
          comparison,
          parsed.metric
        ),
      }
    },
  },
  {
    category: "advertising",
    tool: {
      name: "generate_campaign_recommendations",
      description:
        "Deterministic, evidence-gated recommendations (account-level budget guidance + per-campaign investigation flags where a campaign materially contributed to a loss in efficiency). Each recommendation carries its own confidence level and the evidence behind it -- present these as-is, do not add your own unlisted reasoning or stronger claims than the recommendedAction text itself states.",
      input_schema: {
        type: "object",
        properties: {
          currentPeriod: relativePeriodProperty,
          currentFrom: { type: "string" },
          currentTo: { type: "string" },
          previousFrom: { type: "string" },
          previousTo: { type: "string" },
        },
      },
    },
    schema: z.object({
      currentPeriod: z.enum(RELATIVE_PERIODS).optional(),
      currentFrom: z.string().optional(),
      currentTo: z.string().optional(),
      previousFrom: z.string().optional(),
      previousTo: z.string().optional(),
    }),
    execute: async (actor, services, input) => {
      const ranges = await resolveComparisonPeriods(
        services,
        "advertising",
        actor,
        input as {
          currentPeriod?: RelativePeriod
          currentFrom?: string
          currentTo?: string
          previousFrom?: string
          previousTo?: string
        }
      )
      const comparison = await services.campaignAnalyticsEngine.comparePeriods(actor, ranges)
      const drivers = services.campaignAnalyticsEngine.identifyPerformanceDrivers(
        comparison,
        "roas"
      )
      const contributions = await services.campaignAnalyticsEngine.getContributionAnalysis(actor, {
        ranges,
        limit: 5,
      })
      return {
        recommendations: [
          generateAccountRecommendation(comparison, drivers),
          ...generateContributionRecommendations(
            contributions,
            comparison.period,
            comparison.confidence
          ),
        ],
      }
    },
  },
  {
    category: "advertising",
    tool: {
      name: "get_channel_spend_trend",
      description:
        "Real daily/weekly ad spend broken down by channel (Google Ads, Meta Ads, TikTok Ads, Snapchat) for an optional date range.",
      input_schema: {
        type: "object",
        properties: { ...dateRangeProperties, period: relativePeriodProperty },
      },
    },
    schema: z.object({ ...dateRangeShape, period: z.enum(RELATIVE_PERIODS).optional() }),
    execute: async (actor, services, input) => {
      const parsed = input as { startDate?: string; endDate?: string; period?: RelativePeriod }
      const resolved = await resolveSinglePeriod(services, "advertising", actor, parsed)
      const trend = await services.channelsService.getPerformanceTrend(actor, resolved)
      return withQueriedPeriod(resolved, trend)
    },
  },
  {
    category: "advertising",
    tool: {
      name: "get_campaign_scaling_signals",
      description:
        "Deterministic, non-predictive efficiency signal per campaign (strong_positive/positive/neutral/negative/insufficient_data) based on ROAS AND CPA together versus the account average, gated on conversion volume. This is NOT an instruction to change budget and NEVER implies future performance -- present it as a current-efficiency signal only.",
      input_schema: {
        type: "object",
        properties: { ...dateRangeProperties, period: relativePeriodProperty },
      },
    },
    schema: z.object({ ...dateRangeShape, period: z.enum(RELATIVE_PERIODS).optional() }),
    execute: async (actor, services, input) => {
      const parsed = input as { startDate?: string; endDate?: string; period?: RelativePeriod }
      const resolved = await resolveSinglePeriod(services, "advertising", actor, parsed)
      return services.campaignAnalyticsEngine.getCampaignScalingSignals(actor, resolved)
    },
  },
  {
    category: "advertising",
    tool: {
      name: "get_proactive_insights",
      description:
        "Use this specifically when the user asks a broad, undirected question like 'is there anything I should pay attention to?' or 'how are things going?'. Runs the account comparison, anomaly detection, and contribution analysis together and returns only the most material findings (not everything) -- a short, prioritized list, not a full report.",
      input_schema: { type: "object", properties: {} },
    },
    schema: z.object({}),
    execute: async (actor, services) => {
      const ranges = defaultComparisonRanges()
      const [comparison, anomalies] = await Promise.all([
        services.campaignAnalyticsEngine.comparePeriods(actor, ranges),
        services.campaignAnalyticsEngine.detectAnomalies(actor),
      ])
      const drivers = services.campaignAnalyticsEngine.identifyPerformanceDrivers(
        comparison,
        "roas"
      )
      const contributions =
        comparison.confidence !== "insufficient"
          ? await services.campaignAnalyticsEngine.getContributionAnalysis(actor, {
              ranges,
              limit: 3,
            })
          : []
      // Only material findings -- a >=15-point ROAS move, critical anomalies, and the top 3
      // contributors to any decline. An account with nothing notable gets an empty list back,
      // which is the honest answer to "is there anything I should pay attention to?".
      const roasDelta = comparison.deltas.find((d) => d.metric === "roas")
      const materialAccountChange =
        roasDelta?.changePercent !== null && roasDelta && Math.abs(roasDelta.changePercent) >= 15
          ? roasDelta
          : null
      return {
        accountRoasChange: materialAccountChange,
        drivers: materialAccountChange ? drivers.slice(0, 3) : [],
        criticalAnomalies: anomalies.filter((a) => a.severity === "critical").slice(0, 5),
        warningAnomalies: anomalies.filter((a) => a.severity === "warning").slice(0, 3),
        topContributors: contributions,
        confidence: comparison.confidence,
        period: comparison.period,
      }
    },
  },
  {
    category: "pos",
    tool: {
      name: "get_pos_invoices_summary",
      description:
        "Real point-of-sale invoice totals (completed/cancelled/returned counts, average and total sale value) for an optional date range and status filter.",
      input_schema: {
        type: "object",
        properties: {
          ...dateRangeProperties,
          period: relativePeriodProperty,
          status: {
            type: "string",
            enum: ["completed", "cancelled", "returned", "partially_returned"],
            description: "Omit to include all statuses.",
          },
        },
      },
    },
    schema: z.object({
      ...dateRangeShape,
      period: z.enum(RELATIVE_PERIODS).optional(),
      status: z.enum(["completed", "cancelled", "returned", "partially_returned"]).optional(),
    }),
    execute: async (actor, services, input) => {
      const parsed = input as {
        startDate?: string
        endDate?: string
        period?: RelativePeriod
        status?: string
      }
      const resolved = await resolveSinglePeriod(services, "pos", actor, parsed)
      const summary = await services.posInvoicesService.summary(actor.organizationId, {
        workspaceId: actor.workspaceId,
        status: (parsed.status as Parameters<PosInvoicesService["summary"]>[1]["status"]) ?? null,
        paymentMethodCode: null,
        from: resolved.startDate ?? null,
        to: resolved.endDate ?? null,
      })
      return withQueriedPeriod(resolved, summary)
    },
  },
  {
    category: "pos",
    tool: {
      name: "list_pos_shifts",
      description: "Real list of point-of-sale cash register shifts for the org (open and closed).",
      input_schema: { type: "object", properties: {} },
    },
    schema: z.object({}),
    execute: (actor, services) =>
      services.posShiftsService.list(actor.organizationId, actor.workspaceId),
  },
  {
    category: "pos",
    tool: {
      name: "get_top_selling_products",
      description:
        "Real ranking of best-selling products by revenue, from completed point-of-sale invoices for an optional date range: product name, total quantity sold, total revenue, and number of invoices it appeared on. Use this for any question about which products sell best, how many units sold, or revenue per product.",
      input_schema: {
        type: "object",
        properties: {
          ...dateRangeProperties,
          period: relativePeriodProperty,
          limit: { type: "number", description: "Max products to return, default 10, max 50." },
        },
      },
    },
    schema: z.object({
      ...dateRangeShape,
      period: z.enum(RELATIVE_PERIODS).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    execute: async (actor, services, input) => {
      const parsed = input as {
        startDate?: string
        endDate?: string
        period?: RelativePeriod
        limit?: number
      }
      const resolved = await resolveSinglePeriod(services, "pos", actor, parsed)
      return services.posInvoicesService.topProducts(actor.organizationId, {
        workspaceId: actor.workspaceId,
        from: resolved.startDate ?? null,
        to: resolved.endDate ?? null,
        limit: parsed.limit ?? 10,
      })
    },
  },
  {
    category: "pos",
    tool: {
      name: "analyze_sales_performance",
      description:
        "Use this specifically for 'why' questions about sales (e.g. 'why are sales lower this month?', 'why did revenue drop?'). Deterministically decomposes the revenue change into order-volume effect vs. average-order-value effect, and ranks which products contributed most to the change -- never just 'invoice count went down.' Also reports whether the current period is still in progress and, if so, that the comparison was adjusted to the same number of elapsed days on both sides for fairness. Defaults to this month vs the equal-length period immediately before it. Prefer currentPeriod over explicit dates whenever the question names a relative phrase.",
      input_schema: {
        type: "object",
        properties: {
          currentPeriod: relativePeriodProperty,
          currentFrom: {
            type: "string",
            description:
              "ISO date, start of the period to analyze. Ignored if currentPeriod is set.",
          },
          currentTo: {
            type: "string",
            description: "ISO date, end of the period to analyze. Ignored if currentPeriod is set.",
          },
          previousFrom: {
            type: "string",
            description:
              "ISO date, start of the comparison period. Omit to use the equal-length period immediately before the current period.",
          },
          previousTo: { type: "string", description: "ISO date, end of the comparison period." },
        },
      },
    },
    schema: z.object({
      currentPeriod: z.enum(RELATIVE_PERIODS).optional(),
      currentFrom: z.string().optional(),
      currentTo: z.string().optional(),
      previousFrom: z.string().optional(),
      previousTo: z.string().optional(),
    }),
    execute: async (actor, services, input) => {
      const parsed = input as {
        currentPeriod?: RelativePeriod
        currentFrom?: string
        currentTo?: string
        previousFrom?: string
        previousTo?: string
      }
      const timezone = await getOrganizationTimezone(services.db, actor.organizationId)
      const ranges = await resolveComparisonPeriods(services, "pos", actor, {
        currentPeriod: parsed.currentPeriod ?? (parsed.currentFrom ? undefined : "this_month"),
        currentFrom: parsed.currentFrom,
        currentTo: parsed.currentTo,
        previousFrom: parsed.previousFrom,
        previousTo: parsed.previousTo,
      })
      return services.posSalesAnalyticsEngine.getSalesPerformanceAnalysis(
        actor.organizationId,
        actor.workspaceId,
        ranges,
        timezone
      )
    },
  },
  {
    category: "ecommerce",
    tool: {
      name: "list_orders",
      description:
        "Real e-commerce orders (Salla/Shopify/Zid) and their summary stats (total orders, sales, average order value, and -- for 'why did sales change' questions -- a deterministic decomposition of the revenue change into order-volume effect vs. average-order-value effect, same methodology as POS's analyze_sales_performance) for an optional date range. The comparison period is always the equal-length span immediately before, so a partial current period is compared fairly. For contribution analysis ('which platform/customer drove the change'), follow up with run_kpi_preview on dataSource='orders' using groupByDimension + compareEnabled=true.",
      input_schema: {
        type: "object",
        properties: { ...dateRangeProperties, period: relativePeriodProperty },
      },
    },
    schema: z.object({ ...dateRangeShape, period: z.enum(RELATIVE_PERIODS).optional() }),
    execute: async (actor, services, input) => {
      const parsed = input as { startDate?: string; endDate?: string; period?: RelativePeriod }
      const resolved = await resolveSinglePeriod(services, "ecommerce", actor, parsed)
      const result = await services.ordersAggregationService.listOrders(actor, resolved)
      const withPeriod = withQueriedPeriod(resolved, result)
      if (!resolved.startDate || !resolved.endDate) return withPeriod
      const timezone = await getOrganizationTimezone(services.db, actor.organizationId)
      return {
        ...withPeriod,
        periodFairness: describePeriodFairness(
          { from: resolved.startDate, to: resolved.endDate },
          timezone
        ),
      }
    },
  },
  {
    category: "ecommerce",
    tool: {
      name: "list_stores",
      description:
        "Real connected e-commerce stores (Salla/Shopify/Zid) with their connection status and sync health.",
      input_schema: { type: "object", properties: {} },
    },
    schema: z.object({}),
    execute: (actor, services) => services.storesAggregationService.listStores(actor),
  },
  // Universal Data Intelligence audit, Step 3: the generic query engine (reports/catalog.ts +
  // query-builder.ts -- already production-tested, built for the report-builder feature) exposed
  // to the AI chat for any question that doesn't match one of the hand-written tools above,
  // instead of writing a new dedicated tool per question shape. Scoped per category via
  // getCatalogForApplication, the same server-side enforcement buildToolsForCategory already
  // relies on -- a pos-scoped session can never see/query an ecommerce or advertising data
  // source, regardless of what the model asks for. Step 5: now including advertising too, now
  // that the pattern is proven for POS/ecommerce -- but its own 12 hand-written tools
  // (campaigns/analytics-engine.ts) stay the PRIMARY path (see GENERIC_QUERY_RULES in service.ts
  // -- a dedicated tool is always preferred when one exists); the marketing catalog source only
  // covers Google Ads' 4 raw summable fields today, so this mainly adds a fallback for the long
  // tail, not a replacement for the deeper ranking/decline/contribution/anomaly analysis already
  // built there.
  ...(["pos", "ecommerce", "madarApps", "advertising"] as const).flatMap(
    (category): ToolDefinition[] => [
      {
        category,
        tool: {
          name: "get_report_catalog",
          description:
            "The whitelist of real data sources/fields/dimensions available to query via run_kpi_preview, scoped to this conversation's own application. Call this before run_kpi_preview if unsure which dataSource/field/dimension/filter name is valid -- never invent one. Use this for any reasonable question about this application's data that doesn't match one of your other, more specific tools.",
          input_schema: { type: "object", properties: {} },
        },
        schema: z.object({}),
        execute: async (_actor, services) =>
          services.reportsService.getCatalogForApplication(category),
      },
      {
        category,
        tool: {
          name: "run_kpi_preview",
          description:
            "Runs a real, whitelisted query (dataSource + field + aggregation) over a resolved date range and returns the actual result -- the general-purpose way to answer a question with no dedicated tool. dataSource/field/groupByDimension/filters[].field must come from get_report_catalog -- any other value is rejected. Set groupByDimension for a ranked breakdown ('which product/category/customer contributed most'); set compareEnabled for 'did this change vs the period before'. Set BOTH together for a generic contribution/driver breakdown ('which products caused the decline', 'who contributed to the increase') -- each item in the ranked result then also carries previousValue/delta/deltaPercent vs the preceding equal-length period, ranked by |delta| descending (largest driver of the change first, increases and decreases both included). Prefer `period` (including 'all_time') over startDate/endDate whenever the question names a relative period -- never compute a date yourself. Omit all three only when the question has no time dimension at all.",
          input_schema: {
            type: "object",
            properties: {
              dataSource: { type: "string" },
              field: { type: "string" },
              aggregation: { type: "string", enum: ["sum", "avg", "count", "min", "max"] },
              timeGrouping: {
                type: "string",
                enum: ["day", "week", "month", "quarter", "year", "none"],
                description:
                  "Use 'none' unless the question explicitly asks for a trend over time.",
              },
              groupByDimension: {
                type: "string",
                description:
                  "Optional dimension key from get_report_catalog to break the result down by, ranked by value descending (top 10). Omit for a single aggregate number.",
              },
              filters: {
                type: "array",
                description:
                  "Optional filters, each {field, operator, value} using field/operator names from get_report_catalog's filterFields.",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    operator: { type: "string", enum: ["eq", "neq", "contains", "not_contains"] },
                    value: { type: "string" },
                  },
                  required: ["field", "operator", "value"],
                },
              },
              compareEnabled: {
                type: "boolean",
                description:
                  "When true (and groupByDimension is not set), also returns the equal-length immediately-preceding period's value and percentage change.",
              },
              ...dateRangeProperties,
              period: relativePeriodProperty,
            },
            required: ["dataSource", "field", "aggregation", "timeGrouping"],
          },
        },
        schema: z.object({
          dataSource: z.string(),
          field: z.string(),
          aggregation: z.enum(["sum", "avg", "count", "min", "max"]),
          timeGrouping: z.enum(["day", "week", "month", "quarter", "year", "none"]),
          groupByDimension: z.string().optional(),
          filters: z
            .array(
              z.object({
                field: z.string(),
                operator: z.enum(["eq", "neq", "contains", "not_contains"]),
                value: z.string(),
              })
            )
            .optional(),
          compareEnabled: z.boolean().optional(),
          ...dateRangeShape,
          period: z.enum(RELATIVE_PERIODS).optional(),
        }),
        execute: async (actor, services, input) => {
          const parsed = input as {
            dataSource: string
            field: string
            aggregation: "sum" | "avg" | "count" | "min" | "max"
            timeGrouping: "day" | "week" | "month" | "quarter" | "year" | "none"
            groupByDimension?: string
            filters?: Array<{
              field: string
              operator: "eq" | "neq" | "contains" | "not_contains"
              value: string
            }>
            compareEnabled?: boolean
            period?: RelativePeriod
            startDate?: string
            endDate?: string
          }
          // The catalog's own `application` tag on this data source is the true owning domain,
          // independent of which category this chat session itself is scoped to -- needed
          // because a madarApps-scoped session's catalog spans every domain (see
          // getCatalogForApplication's own comment), so "this_month" must resolve in the
          // timezone/coverage sense appropriate to whichever domain was actually picked, not to
          // "madarApps" (which isn't a resolvable domain -- no data source is ever tagged that).
          const catalogSource = findDataSource(parsed.dataSource)
          const domain: AnalyticsDomain | null =
            catalogSource?.application === "advertising" ||
            catalogSource?.application === "pos" ||
            catalogSource?.application === "ecommerce"
              ? catalogSource.application
              : null
          const resolved = domain
            ? await resolveSinglePeriod(services, domain, actor, {
                period: parsed.period,
                startDate: parsed.startDate,
                endDate: parsed.endDate,
              })
            : { startDate: parsed.startDate, endDate: parsed.endDate }
          return services.reportsService.previewKpi(actor, {
            dataSource: parsed.dataSource,
            field: parsed.field,
            aggregation: parsed.aggregation,
            timeGrouping: parsed.timeGrouping,
            filters: parsed.filters ?? [],
            groupByDimension: parsed.groupByDimension ?? null,
            compareEnabled: parsed.compareEnabled ?? false,
            workspaceId: actor.workspaceId,
            range:
              resolved.startDate && resolved.endDate
                ? { from: resolved.startDate, to: resolved.endDate }
                : undefined,
          })
        },
      },
    ]
  ),
]

export function buildToolsForCategory(category: ApplicationCategoryId): Anthropic.Tool[] {
  return TOOL_DEFINITIONS.filter((definition) => definition.category === category).map(
    (definition) => definition.tool
  )
}

export async function dispatchToolCall(
  category: ApplicationCategoryId,
  toolName: string,
  rawInput: unknown,
  actor: AuthenticatedActor,
  services: AiChatToolServices
): Promise<{ result?: unknown; error?: string }> {
  const definition = TOOL_DEFINITIONS.find(
    (d) => d.category === category && d.tool.name === toolName
  )
  if (!definition) {
    // The model asked for a tool outside this session's category -- it was never declared to
    // it, so this should be unreachable, but a defensive error beats a thrown exception that
    // would kill the whole turn.
    return { error: `Tool "${toolName}" is not available in this conversation.` }
  }
  const parsed = definition.schema.safeParse(rawInput ?? {})
  if (!parsed.success) {
    return { error: `Invalid input for ${toolName}: ${parsed.error.message}` }
  }
  try {
    const result = await definition.execute(actor, services, parsed.data as Record<string, unknown>)
    return { result }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Tool execution failed." }
  }
}
