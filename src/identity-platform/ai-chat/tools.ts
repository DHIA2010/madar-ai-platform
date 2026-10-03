import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import {
  defaultComparisonRanges,
  type CampaignAnalyticsEngine,
} from "../campaigns/analytics-engine"
import type { MetricKey } from "../campaigns/analytics-types"
import type { CampaignsPerformanceAggregationService } from "../campaigns/performance-service"
import {
  generateAccountRecommendation,
  generateContributionRecommendations,
} from "../campaigns/recommendation-engine"
import type { ChannelsAggregationService } from "../channels/channels-service"
import type { OrdersAggregationService } from "../orders/service"
import type { PosInvoicesService } from "../pos/invoices-service"
import type { PosShiftsService } from "../pos/shifts-service"
import type { ReportsService } from "../reports/service"
import type { StoresAggregationService } from "../stores/service"

import type { ApplicationCategoryId } from "./types"

export interface AiChatToolServices {
  campaignPerformanceService: CampaignsPerformanceAggregationService
  channelsService: ChannelsAggregationService
  campaignAnalyticsEngine: CampaignAnalyticsEngine
  ordersAggregationService: OrdersAggregationService
  storesAggregationService: StoresAggregationService
  posInvoicesService: PosInvoicesService
  posShiftsService: PosShiftsService
  reportsService: ReportsService
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
      name: "get_campaign_summary",
      description:
        "Real ad account summary for an optional date range: spend, revenue, ROAS, impressions, clicks, CTR, CPC, CPM, conversions, conversion rate, CPA, active campaign count -- plus data freshness per channel and a confidence level based on sample size. Reach/frequency/creative/audience/geo/device breakdowns are not available at this level -- say so if asked, never estimate them.",
      input_schema: {
        type: "object",
        properties: { ...dateRangeProperties },
      },
    },
    schema: z.object(dateRangeShape),
    execute: (actor, services, input) =>
      services.campaignAnalyticsEngine.getCampaignSummary(
        actor,
        input as { startDate?: string; endDate?: string }
      ),
  },
  {
    category: "advertising",
    tool: {
      name: "compare_campaign_periods",
      description:
        "Deterministic before/after comparison of the account-wide summary between two periods (defaults to this-30-days vs previous-30-days if dates are omitted). Returns raw current/previous values, percentage change, and a confidence level -- never calculate these percentages yourself, always call this tool.",
      input_schema: {
        type: "object",
        properties: {
          currentFrom: { type: "string", description: "ISO date, start of the period to analyze." },
          currentTo: { type: "string", description: "ISO date, end of the period to analyze." },
          previousFrom: {
            type: "string",
            description:
              "ISO date, start of the comparison period. Omit to use the equal-length period immediately before currentFrom.",
          },
          previousTo: { type: "string", description: "ISO date, end of the comparison period." },
        },
      },
    },
    schema: z.object({
      currentFrom: z.string().optional(),
      currentTo: z.string().optional(),
      previousFrom: z.string().optional(),
      previousTo: z.string().optional(),
    }),
    execute: (actor, services, input) => {
      const ranges = resolveRanges(
        input as {
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
        properties: { ...dateRangeProperties },
      },
    },
    schema: z.object(dateRangeShape),
    execute: (actor, services, input) =>
      services.campaignAnalyticsEngine.getChannelComparison(
        actor,
        input as { startDate?: string; endDate?: string }
      ),
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
          metric: { type: "string", enum: RANKABLE_METRICS as unknown as string[] },
          direction: { type: "string", enum: ["top", "bottom"] },
          limit: { type: "number", description: "Max rows to return, default 5, max 20." },
        },
        required: ["metric", "direction"],
      },
    },
    schema: z.object({
      ...dateRangeShape,
      metric: z.enum(RANKABLE_METRICS),
      direction: z.enum(["top", "bottom"]),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: (actor, services, input) => {
      const parsed = input as {
        startDate?: string
        endDate?: string
        metric: MetricKey
        direction: "top" | "bottom"
        limit?: number
      }
      return services.campaignAnalyticsEngine.getCampaignRanking(actor, {
        query: { startDate: parsed.startDate, endDate: parsed.endDate },
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
      currentFrom: z.string().optional(),
      currentTo: z.string().optional(),
      previousFrom: z.string().optional(),
      previousTo: z.string().optional(),
      metric: z.enum(RANKABLE_METRICS),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: (actor, services, input) => {
      const parsed = input as {
        currentFrom?: string
        currentTo?: string
        previousFrom?: string
        previousTo?: string
        metric: MetricKey
        limit?: number
      }
      const ranges = resolveRanges(parsed)
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
      currentFrom: z.string().optional(),
      currentTo: z.string().optional(),
      previousFrom: z.string().optional(),
      previousTo: z.string().optional(),
      metric: z.enum(RANKABLE_METRICS),
    }),
    execute: async (actor, services, input) => {
      const parsed = input as {
        currentFrom?: string
        currentTo?: string
        previousFrom?: string
        previousTo?: string
        metric: MetricKey
      }
      const ranges = resolveRanges(parsed)
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
          currentFrom: { type: "string" },
          currentTo: { type: "string" },
          previousFrom: { type: "string" },
          previousTo: { type: "string" },
        },
      },
    },
    schema: z.object({
      currentFrom: z.string().optional(),
      currentTo: z.string().optional(),
      previousFrom: z.string().optional(),
      previousTo: z.string().optional(),
    }),
    execute: async (actor, services, input) => {
      const ranges = resolveRanges(
        input as {
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
        properties: { ...dateRangeProperties },
      },
    },
    schema: z.object(dateRangeShape),
    execute: (actor, services, input) =>
      services.channelsService.getPerformanceTrend(
        actor,
        input as { startDate?: string; endDate?: string }
      ),
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
      status: z.enum(["completed", "cancelled", "returned", "partially_returned"]).optional(),
    }),
    execute: (actor, services, input) => {
      const parsed = input as { startDate?: string; endDate?: string; status?: string }
      return services.posInvoicesService.summary(actor.organizationId, {
        workspaceId: actor.workspaceId,
        status: (parsed.status as Parameters<PosInvoicesService["summary"]>[1]["status"]) ?? null,
        paymentMethodCode: null,
        from: parsed.startDate ?? null,
        to: parsed.endDate ?? null,
      })
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
          limit: { type: "number", description: "Max products to return, default 10, max 50." },
        },
      },
    },
    schema: z.object({
      ...dateRangeShape,
      limit: z.number().int().min(1).max(50).optional(),
    }),
    execute: (actor, services, input) => {
      const parsed = input as { startDate?: string; endDate?: string; limit?: number }
      return services.posInvoicesService.topProducts(actor.organizationId, {
        workspaceId: actor.workspaceId,
        from: parsed.startDate ?? null,
        to: parsed.endDate ?? null,
        limit: parsed.limit ?? 10,
      })
    },
  },
  {
    category: "ecommerce",
    tool: {
      name: "list_orders",
      description:
        "Real e-commerce orders (Salla/Shopify/Zid) and their summary stats (total orders, sales, average order value) for an optional date range.",
      input_schema: {
        type: "object",
        properties: { ...dateRangeProperties },
      },
    },
    schema: z.object(dateRangeShape),
    execute: (actor, services, input) =>
      services.ordersAggregationService.listOrders(
        actor,
        input as { startDate?: string; endDate?: string }
      ),
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
  {
    category: "madarApps",
    tool: {
      name: "get_report_catalog",
      description:
        "The whitelist of real data sources/fields available to query via run_kpi_preview (sales, products, inventory, customers, financial, marketing). Call this before run_kpi_preview if unsure which dataSource/field names are valid.",
      input_schema: { type: "object", properties: {} },
    },
    schema: z.object({}),
    execute: async (_actor, services) => services.reportsService.getCatalog(),
  },
  {
    category: "madarApps",
    tool: {
      name: "run_kpi_preview",
      description:
        "Runs a real, whitelisted KPI query (one dataSource + field + aggregation, e.g. sum of sales.revenue) and returns the actual result. dataSource/field must come from get_report_catalog -- any other value is rejected.",
      input_schema: {
        type: "object",
        properties: {
          dataSource: { type: "string" },
          field: { type: "string" },
          aggregation: { type: "string", enum: ["sum", "avg", "count", "min", "max"] },
          timeGrouping: {
            type: "string",
            enum: ["day", "week", "month", "quarter", "year", "none"],
          },
        },
        required: ["dataSource", "field", "aggregation", "timeGrouping"],
      },
    },
    schema: z.object({
      dataSource: z.string(),
      field: z.string(),
      aggregation: z.enum(["sum", "avg", "count", "min", "max"]),
      timeGrouping: z.enum(["day", "week", "month", "quarter", "year", "none"]),
    }),
    execute: (actor, services, input) =>
      services.reportsService.previewKpi(actor, {
        ...(input as {
          dataSource: string
          field: string
          aggregation: "sum" | "avg" | "count" | "min" | "max"
          timeGrouping: "day" | "week" | "month" | "quarter" | "year" | "none"
        }),
        filters: [],
        groupByDimension: null,
        compareEnabled: false,
        workspaceId: actor.workspaceId,
      }),
  },
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
