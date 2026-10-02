import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { CampaignsPerformanceAggregationService } from "../campaigns/performance-service"
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
  ordersAggregationService: OrdersAggregationService
  storesAggregationService: StoresAggregationService
  posInvoicesService: PosInvoicesService
  posShiftsService: PosShiftsService
  reportsService: ReportsService
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
      name: "get_campaign_performance_summary",
      description:
        "Real ad-spend/revenue/ROAS/conversions summary across Google/Meta/TikTok/Snapchat for the org, for an optional date range.",
      input_schema: {
        type: "object",
        properties: { ...dateRangeProperties },
      },
    },
    schema: z.object(dateRangeShape),
    execute: (actor, services, input) =>
      services.campaignPerformanceService.getSummary(
        actor,
        input as { startDate?: string; endDate?: string }
      ),
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
