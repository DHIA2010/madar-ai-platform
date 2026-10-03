// @vitest-environment node
//
// Unit tests for buildStructuredResponse (ai-chat/response-formatter.ts) -- the pure function
// that derives the structured facts/insights/recommendations/KPI-cards/chart envelope from a
// turn's raw tool results. Never touches the LLM or the database: every input here is a
// hand-built tool-output shape, same as what dispatchToolCall would have actually returned.

import { describe, expect, it } from "vitest"

import type {
  AnomalyFlag,
  CampaignRow,
  CampaignScalingSignal,
  ChannelComparisonRow,
  MetricSnapshot,
  PeriodComparisonResult,
} from "../campaigns/analytics-types"
import { buildStructuredResponse } from "../ai-chat/response-formatter"
import type { RawToolResult } from "../ai-chat/response-types"

function snapshot(overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return {
    spend: 10_000,
    revenue: 40_000,
    roas: 4,
    impressions: 100_000,
    clicks: 2_000,
    ctr: 2,
    cpc: 5,
    cpm: 100,
    conversions: 200,
    conversionRate: 10,
    cpa: 50,
    activeCampaigns: 5,
    ...overrides,
  }
}

describe("buildStructuredResponse", () => {
  it("returns null when no analytics tool was called this turn", () => {
    const result = buildStructuredResponse(
      [{ tool: "get_metric_definitions", output: { roas: "revenue / spend" } }],
      "Asia/Riyadh"
    )
    expect(result).toBeNull()
  })

  it("builds facts and KPI cards from a period comparison, never inventing a value not in the deltas", () => {
    const comparison: PeriodComparisonResult = {
      period: {
        current: { from: "2026-09-01", to: "2026-09-30" },
        previous: { from: "2026-08-01", to: "2026-08-31" },
      },
      current: snapshot({ spend: 13_000 }),
      previous: snapshot({ spend: 10_000 }),
      deltas: [
        {
          metric: "spend",
          current: 13_000,
          previous: 10_000,
          changePercent: 30,
          changeAbsolute: 3_000,
        },
        {
          metric: "revenue",
          current: 40_000,
          previous: 40_000,
          changePercent: 0,
          changeAbsolute: 0,
        },
        { metric: "roas", current: 3.08, previous: 4, changePercent: -23, changeAbsolute: -0.92 },
        {
          metric: "impressions",
          current: 100_000,
          previous: 100_000,
          changePercent: 0,
          changeAbsolute: 0,
        },
        { metric: "clicks", current: 2_000, previous: 2_000, changePercent: 0, changeAbsolute: 0 },
        { metric: "ctr", current: 2, previous: 2, changePercent: 0, changeAbsolute: 0 },
        { metric: "cpc", current: 6.5, previous: 5, changePercent: 30, changeAbsolute: 1.5 },
        { metric: "cpm", current: 100, previous: 100, changePercent: 0, changeAbsolute: 0 },
        { metric: "conversions", current: 200, previous: 200, changePercent: 0, changeAbsolute: 0 },
        {
          metric: "conversionRate",
          current: 10,
          previous: 10,
          changePercent: 0,
          changeAbsolute: 0,
        },
        { metric: "cpa", current: 65, previous: 50, changePercent: 30, changeAbsolute: 15 },
        { metric: "activeCampaigns", current: 5, previous: 5, changePercent: 0, changeAbsolute: 0 },
      ],
      freshness: [],
      sampleSize: { spend: 13_000, clicks: 2_000, conversions: 200, days: 30 },
      confidence: "high",
    }
    const raw: RawToolResult[] = [{ tool: "compare_campaign_periods", output: comparison }]

    const result = buildStructuredResponse(raw, "Asia/Riyadh")
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe("high")
    expect(result!.dataPeriod).toEqual({ from: "2026-09-01", to: "2026-09-30" })

    // Only material (>=10%) deltas become facts -- revenue/impressions/etc with 0% change
    // must not appear.
    const factMetrics = result!.facts.map((f) => f.metric)
    expect(factMetrics).toContain("spend")
    expect(factMetrics).toContain("roas")
    expect(factMetrics).not.toContain("revenue")

    // Exactly the 5 headline metrics become KPI cards, with values taken verbatim from the deltas.
    expect(result!.metrics).toHaveLength(5)
    const spendCard = result!.metrics.find((m) => m.title === "الإنفاق")!
    expect(spendCard.value).toBe(13_000)
    expect(spendCard.changePercent).toBe(30)
    expect(spendCard.trend).toBe("up")
  })

  it("attaches supporting-change insights for anomalies that have them, and skips those that don't", () => {
    const anomalies: AnomalyFlag[] = [
      {
        type: "roas_drop",
        scope: "campaign",
        entityId: "camp-1",
        entityName: "Campaign X",
        severity: "critical",
        detail: "Campaign X: roas تغيّر -40% مقارنة بالفترة السابقة",
        changePercent: -40,
        supportingChanges: [
          { metric: "cpc", current: 8, previous: 5, changePercent: 60, changeAbsolute: 3 },
        ],
      },
      {
        type: "stale_sync",
        scope: "channel",
        entityId: null,
        entityName: "Meta Ads",
        severity: "warning",
        detail: "Meta Ads: لم تتم المزامنة منذ 120 دقيقة",
        changePercent: null,
      },
    ]
    const result = buildStructuredResponse(
      [{ tool: "get_campaign_anomalies", output: anomalies }],
      "Asia/Riyadh"
    )

    expect(result).not.toBeNull()
    expect(result!.facts).toHaveLength(2)
    // Only the anomaly WITH supportingChanges produces an insight.
    expect(result!.insights).toHaveLength(1)
    expect(result!.insights[0].statement).toContain("Campaign X")
    expect(result!.insights[0].relatedMetrics).toEqual(["cpc"])
  })

  it("turns scaling signals into insights, skipping insufficient_data and neutral", () => {
    const signals: CampaignScalingSignal[] = [
      {
        campaignId: "a",
        campaignName: "A",
        signal: "strong_positive",
        roasVsAccountPercent: 30,
        cpaVsAccountPercent: -20,
        conversionVolume: 40,
        confidence: "high",
      },
      {
        campaignId: "b",
        campaignName: "B",
        signal: "insufficient_data",
        roasVsAccountPercent: null,
        cpaVsAccountPercent: null,
        conversionVolume: 1,
        confidence: "insufficient",
      },
      {
        campaignId: "c",
        campaignName: "C",
        signal: "neutral",
        roasVsAccountPercent: 2,
        cpaVsAccountPercent: 1,
        conversionVolume: 20,
        confidence: "high",
      },
    ]
    const result = buildStructuredResponse(
      [{ tool: "get_campaign_scaling_signals", output: signals }],
      "Asia/Riyadh"
    )

    expect(result).not.toBeNull()
    expect(result!.insights).toHaveLength(1)
    expect(result!.insights[0].statement).toContain("A")
  })

  it("builds a chart from channel comparison rows only when rows are present", () => {
    const rows: ChannelComparisonRow[] = [
      {
        channel: "Google Search",
        metrics: snapshot({ revenue: 20_000 }),
        freshness: {
          channel: "Google Search",
          connected: true,
          lastSyncedAt: null,
          minutesSinceSync: null,
          isStale: false,
        },
        sampleSize: { spend: 5000, clicks: 500, conversions: 20, days: 30 },
        confidence: "high",
      },
    ]
    const withRows = buildStructuredResponse(
      [{ tool: "get_channel_comparison", output: rows }],
      "Asia/Riyadh"
    )
    expect(withRows!.charts).toHaveLength(1)
    expect(withRows!.charts[0].series[0].data[0]).toEqual({ label: "Google Search", value: 20_000 })

    const withoutRows = buildStructuredResponse(
      [{ tool: "get_channel_comparison", output: [] }],
      "Asia/Riyadh"
    )
    expect(withoutRows!.charts).toHaveLength(0)
  })

  it("builds a chart from top campaigns by revenue", () => {
    const rows: CampaignRow[] = [
      {
        id: "camp-1",
        name: "Campaign One",
        platform: "Google Search",
        status: "Active",
        metrics: snapshot({ revenue: 50_000 }),
        sampleSize: { spend: 5000, clicks: 500, conversions: 20, days: 30 },
        confidence: "high",
      },
    ]
    const result = buildStructuredResponse(
      [{ tool: "get_top_campaigns", output: rows }],
      "Asia/Riyadh"
    )
    expect(result!.charts).toHaveLength(1)
    expect(result!.charts[0].series[0].data[0]).toEqual({ label: "Campaign One", value: 50_000 })
  })

  it("builds a bar chart from POS top-selling products and tags the source domain as pos", () => {
    const rows = [
      {
        productId: "p1",
        productName: "Product A",
        quantitySold: 40,
        revenue: 4000,
        invoiceCount: 12,
      },
      {
        productId: null,
        productName: "Custom Item",
        quantitySold: 5,
        revenue: 500,
        invoiceCount: 3,
      },
    ]
    const result = buildStructuredResponse(
      [{ tool: "get_top_selling_products", output: rows }],
      "Asia/Riyadh"
    )

    expect(result).not.toBeNull()
    expect(result!.source).toEqual({ domain: "pos" })
    expect(result!.charts).toHaveLength(1)
    expect(result!.charts[0].chartType).toBe("bar")
    expect(result!.charts[0].series[0].data).toEqual([
      { label: "Product A", value: 4000 },
      { label: "Custom Item", value: 500 },
    ])
  })

  it("builds a shifts ReportTable with Arabic-formatted dates in the org timezone, dashes for an open shift's missing fields", () => {
    const rows = [
      {
        id: "shift-1",
        shiftNumber: 1,
        status: "closed" as const,
        openingCashAmount: 500,
        closingCashAmount: 620,
        openedAt: "2026-09-14T06:00:00.000Z",
        closedAt: "2026-09-22T17:32:00.000Z",
      },
      {
        id: "shift-2",
        shiftNumber: 2,
        status: "open" as const,
        openingCashAmount: 300,
        closingCashAmount: null,
        openedAt: "2026-09-22T17:32:00.000Z",
        closedAt: null,
      },
    ]
    const result = buildStructuredResponse(
      [{ tool: "list_pos_shifts", output: rows }],
      "Asia/Riyadh"
    )

    expect(result).not.toBeNull()
    expect(result!.source).toEqual({ domain: "pos" })
    expect(result!.tables).toHaveLength(1)
    const table = result!.tables[0]
    expect(table.rows[0].shiftNumber).toBe("#1")
    expect(table.rows[0].status).toBe("مغلقة")
    // No raw ISO timestamp or pipe-delimited text ever reaches the row -- a human-readable,
    // org-timezone-formatted Arabic string instead (this is the exact screenshot regression).
    expect(table.rows[0].closedAt).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(table.rows[0].closedAt).toContain("سبتمبر")
    expect(table.rows[1].status).toBe("مفتوحة")
    expect(table.rows[1].closedAt).toBeNull()
  })

  it("returns an empty table list (but a non-null envelope) for an empty shift list", () => {
    const result = buildStructuredResponse([{ tool: "list_pos_shifts", output: [] }], "Asia/Riyadh")
    expect(result).not.toBeNull()
    expect(result!.tables).toHaveLength(0)
  })

  it("builds KPI cards from a POS invoice summary", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "get_pos_invoices_summary",
          output: {
            totalCount: 10,
            completedCount: 7,
            cancelledCount: 1,
            returnedCount: 2,
            averageCompletedValue: 150,
            totalCompletedAmount: 1050,
          },
        },
      ],
      "Asia/Riyadh"
    )

    expect(result).not.toBeNull()
    expect(result!.source).toEqual({ domain: "pos" })
    expect(result!.metrics).toHaveLength(5)
    const total = result!.metrics.find((m) => m.title === "إجمالي المبيعات المكتملة")!
    expect(total.value).toBe(1050)
    expect(total.format).toBe("currency")
  })

  it("builds an ecommerce ReportTable from list_orders, localizing the order status", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "list_orders",
          output: {
            items: [
              {
                id: "o1",
                orderNumber: "#1001",
                customerName: "Ahmed",
                platform: "Salla",
                amount: 250,
                orderStatus: "Completed",
                createdAt: "2026-09-20T10:00:00.000Z",
              },
            ],
            summary: {},
          },
        },
      ],
      "Asia/Riyadh"
    )

    expect(result).not.toBeNull()
    expect(result!.source).toEqual({ domain: "ecommerce" })
    expect(result!.tables).toHaveLength(1)
    expect(result!.tables[0].rows[0].orderStatus).toBe("مكتمل")
    expect(result!.tables[0].rows[0].amount).toBe(250)
  })

  it("builds an ecommerce ReportTable from list_stores with a formatted last-sync time", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "list_stores",
          output: [
            {
              id: "s1",
              name: "My Store",
              platform: "Shopify",
              connectionStatus: "connected",
              orderCount: 42,
              lastSyncAt: "2026-09-22T05:00:00.000Z",
            },
          ],
        },
      ],
      "Asia/Riyadh"
    )

    expect(result).not.toBeNull()
    expect(result!.tables).toHaveLength(1)
    expect(result!.tables[0].rows[0].connectionStatus).toBe("متصل")
    expect(result!.tables[0].rows[0].lastSyncAt).toContain("سبتمبر")
  })

  it("builds a single KPI card from run_kpi_preview, carrying its own comparison if present", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "run_kpi_preview",
          output: { points: [], currentValue: 5000, previousValue: 4000, changePercent: 25 },
        },
      ],
      "Asia/Riyadh"
    )

    expect(result).not.toBeNull()
    expect(result!.source).toEqual({ domain: "madarApps" })
    expect(result!.metrics).toHaveLength(1)
    expect(result!.metrics[0].value).toBe(5000)
    expect(result!.metrics[0].trend).toBe("up")
  })

  it("returns an empty chart list for top-selling products when there are none, but still a non-null envelope", () => {
    const result = buildStructuredResponse(
      [{ tool: "get_top_selling_products", output: [] }],
      "Asia/Riyadh"
    )
    expect(result).not.toBeNull()
    expect(result!.charts).toHaveLength(0)
  })

  it("merges multiple tool calls from the same turn into a single envelope", () => {
    const comparison: PeriodComparisonResult = {
      period: {
        current: { from: "2026-09-01", to: "2026-09-30" },
        previous: { from: "2026-08-01", to: "2026-08-31" },
      },
      current: snapshot(),
      previous: snapshot(),
      deltas: (Object.keys(snapshot()) as Array<keyof MetricSnapshot>).map((metric) => ({
        metric,
        current: snapshot()[metric],
        previous: snapshot()[metric],
        changePercent: 0,
        changeAbsolute: 0,
      })),
      freshness: [],
      sampleSize: { spend: 10_000, clicks: 2_000, conversions: 200, days: 30 },
      confidence: "medium",
    }
    const result = buildStructuredResponse(
      [
        { tool: "compare_campaign_periods", output: comparison },
        {
          tool: "generate_campaign_recommendations",
          output: {
            recommendations: [
              {
                type: "no_action",
                priority: "low",
                entityType: "account",
                entityId: null,
                entityName: null,
                reason: "لا تغيّر جوهري",
                evidence: [],
                confidence: "medium",
                recommendedAction: "لا حاجة لإجراء حاليًا.",
              },
            ],
          },
        },
      ],
      "Asia/Riyadh"
    )

    expect(result).not.toBeNull()
    expect(result!.metrics.length).toBeGreaterThan(0)
    expect(result!.recommendations).toHaveLength(1)
    expect(result!.recommendations[0].type).toBe("no_action")
  })
})
