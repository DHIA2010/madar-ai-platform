// @vitest-environment node
//
// Unit tests for buildStructuredResponse (ai-chat/response-formatter.ts) -- the pure function
// that derives the structured facts/insights/recommendations/KPI-cards/chart envelope from a
// turn's raw tool results. Never touches the LLM or the database: every input here is a
// hand-built tool-output shape, same as what dispatchToolCall would have actually returned.

import { describe, expect, it, vi } from "vitest"

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
    // Analytical-title fix (audit item 5): was a static dataset-label title regardless of the
    // data -- now the same ranking framing the generic/contribution paths already use.
    expect(withRows!.charts[0].title).toBe("أعلى قيم الإيرادات حسب القناة")

    const withoutRows = buildStructuredResponse(
      [{ tool: "get_channel_comparison", output: [] }],
      "Asia/Riyadh"
    )
    expect(withoutRows!.charts).toHaveLength(0)
  })

  it("builds a line chart from the channel spend trend, summing spend across channels per bucket", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "get_channel_spend_trend",
          output: {
            items: [
              { bucketStart: "2026-09-01", spendByChannel: { "Google Ads": 100, "Meta Ads": 50 } },
              { bucketStart: "2026-09-02", spendByChannel: { "Google Ads": 120, "Meta Ads": 60 } },
            ],
          },
        },
      ],
      "Asia/Riyadh"
    )
    expect(result).not.toBeNull()
    expect(result!.charts).toHaveLength(1)
    expect(result!.charts[0].chartType).toBe("line")
    expect(result!.charts[0].series[0].data).toEqual([
      { label: "2026-09-01", value: 150 },
      { label: "2026-09-02", value: 180 },
    ])
    // Analytical-title fix (audit item 5): names the real trend direction (150 -> 180 is
    // upward) instead of a static label that never changed regardless of the data.
    expect(result!.charts[0].title).toBe("اتجاه الإنفاق الإعلاني -- تصاعدي خلال الفترة")
  })

  it("names a downward trend direction when spend fell across the period", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "get_channel_spend_trend",
          output: {
            items: [
              { bucketStart: "2026-09-01", spendByChannel: { "Google Ads": 200 } },
              { bucketStart: "2026-09-02", spendByChannel: { "Google Ads": 100 } },
            ],
          },
        },
      ],
      "Asia/Riyadh"
    )
    expect(result!.charts[0].title).toBe("اتجاه الإنفاق الإعلاني -- تنازلي خلال الفترة")
  })

  it("names the trend as stable when spend barely changed across the period", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "get_channel_spend_trend",
          output: {
            items: [
              { bucketStart: "2026-09-01", spendByChannel: { "Google Ads": 100 } },
              { bucketStart: "2026-09-02", spendByChannel: { "Google Ads": 100.05 } },
            ],
          },
        },
      ],
      "Asia/Riyadh"
    )
    expect(result!.charts[0].title).toBe("اتجاه الإنفاق الإعلاني -- مستقر خلال الفترة")
  })

  it("returns no chart (but a non-null envelope) for an empty spend trend", () => {
    const result = buildStructuredResponse(
      [{ tool: "get_channel_spend_trend", output: { items: [] } }],
      "Asia/Riyadh"
    )
    expect(result).not.toBeNull()
    expect(result!.charts).toHaveLength(0)
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
    expect(result!.charts[0].chartType).toBe("bar")
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
            // listOrders() always returns a populated summary alongside items (never just
            // items alone) -- this mirrors its real OrdersSummaryStats shape, including the
            // revenue decomposition added alongside the ecommerce driver-analysis work.
            summary: {
              totalOrders: 1,
              totalOrdersChangePct: null,
              previousTotalOrders: 0,
              totalSales: 250,
              totalSalesChangePct: null,
              previousTotalSales: 0,
              averageOrderValue: 250,
              averageOrderValueChangePct: null,
              previousAverageOrderValue: 0,
              decomposition: {
                revenueChange: 250,
                orderEffect: 0,
                aovEffect: 250,
                orderEffectPercent: 0,
                aovEffectPercent: 100,
                dominantDriver: "aov",
              },
              confidence: "high",
            },
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

    // Analysis Orchestration audit (Genie-upgrade, round 2) section 4: list_orders' summary now
    // carries KPI cards and a typed driver finding from the same decomposeRevenueChange
    // methodology POS already used -- e-commerce reaches parity here for the first time.
    expect(result!.metrics).toHaveLength(3)
    expect(result!.metrics.find((m) => m.title === "إجمالي المبيعات")!.value).toBe(250)
    expect(result!.drivers).toHaveLength(2)
    expect(result!.drivers.find((d) => d.metric === "aov")!.role).toBe("primary")
    expect(result!.drivers.find((d) => d.metric === "aov")!.confidence).toBe("high")
    // No material revenue change signal (totalSalesChangePct is null, a first-ever period with
    // nothing to compare against) -- no recommendation filler should be attached either.
    expect(result!.recommendations).toHaveLength(0)
    expect(result!.confidence).toBe("high")
  })

  function ordersSummary(overrides: Record<string, unknown> = {}) {
    return {
      totalOrders: 10,
      totalOrdersChangePct: -50,
      previousTotalOrders: 20,
      totalSales: 1000,
      totalSalesChangePct: -50,
      previousTotalSales: 2000,
      averageOrderValue: 100,
      averageOrderValueChangePct: 0,
      previousAverageOrderValue: 100,
      decomposition: {
        revenueChange: -1000,
        orderEffect: -1000,
        aovEffect: 0,
        orderEffectPercent: 100,
        aovEffectPercent: 0,
        dominantDriver: "orders",
      },
      confidence: "high",
      ...overrides,
    }
  }

  describe("list_orders recommendations (e-commerce, Genie-level analytical response upgrade)", () => {
    it("recommends investigating the dominant driver when sales declined materially", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "list_orders",
            output: { items: [], summary: ordersSummary(), queriedPeriod: null },
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.recommendations).toHaveLength(1)
      expect(result!.recommendations[0].type).toBe("investigate_decline")
      expect(result!.recommendations[0].entityType).toBe("account")
      expect(result!.recommendations[0].reason).toContain("عدد الطلبات")
      expect(result!.recommendations[0].confidence).toBe("high")
    })

    it("notes positive performance with a no_action recommendation when sales grew materially", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "list_orders",
            output: {
              items: [],
              summary: ordersSummary({ totalSalesChangePct: 30 }),
              queriedPeriod: null,
            },
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.recommendations).toHaveLength(1)
      expect(result!.recommendations[0].type).toBe("no_action")
      expect(result!.recommendations[0].reason).toContain("ارتفعت")
    })

    it("returns an insufficient-data recommendation when confidence is insufficient", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "list_orders",
            output: {
              items: [],
              summary: ordersSummary({ confidence: "insufficient" }),
              queriedPeriod: null,
            },
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.recommendations).toHaveLength(1)
      expect(result!.recommendations[0].type).toBe("no_action")
      expect(result!.recommendations[0].confidence).toBe("insufficient")
    })

    it("returns no recommendation when nothing changed (dominantDriver: none)", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "list_orders",
            output: {
              items: [],
              summary: ordersSummary({
                totalSalesChangePct: 0,
                decomposition: {
                  revenueChange: 0,
                  orderEffect: 0,
                  aovEffect: 0,
                  orderEffectPercent: null,
                  aovEffectPercent: null,
                  dominantDriver: "none",
                },
              }),
              queriedPeriod: null,
            },
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.recommendations).toHaveLength(0)
    })
  })

  it("warns when list_orders' current period hasn't fully elapsed yet", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "list_orders",
          output: {
            items: [],
            summary: {
              totalOrders: 1,
              totalOrdersChangePct: null,
              previousTotalOrders: 1,
              totalSales: 100,
              totalSalesChangePct: 0,
              previousTotalSales: 100,
              averageOrderValue: 100,
              averageOrderValueChangePct: 0,
              previousAverageOrderValue: 100,
              decomposition: {
                revenueChange: 0,
                orderEffect: 0,
                aovEffect: 0,
                orderEffectPercent: null,
                aovEffectPercent: null,
                dominantDriver: "none",
              },
              confidence: "low",
            },
            periodFairness: { isCurrentPeriodIncomplete: true, elapsedDays: 3 },
          },
        },
      ],
      "Asia/Riyadh"
    )

    expect(result!.warnings.some((w) => w.type === "incomplete_period")).toBe(true)
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
    // Audit item 4: run_kpi_preview was the highest-impact tool with zero follow-up coverage --
    // a single compared value (no grouping) should still suggest drilling into contributors.
    expect(result!.followUpQuestions).toContain("ما أكبر المساهمين في هذا التغيّر؟")
  })

  it("builds typed contribution findings from run_kpi_preview's groupByDimension+compareEnabled mode", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "run_kpi_preview",
          output: {
            points: [
              {
                label: "card",
                value: 50,
                extraValues: { previousValue: 200, delta: -150, deltaPercent: -75 },
              },
              {
                label: "cash",
                value: 100,
                extraValues: { previousValue: 20, delta: 80, deltaPercent: 400 },
              },
            ],
            currentValue: 150,
            previousValue: 220,
            changePercent: -31.8,
            sampleSize: 10,
            meta: {
              dataSourceLabel: "المبيعات",
              fieldLabel: "إجمالي المبيعات",
              groupByDimensionLabel: "payment_method",
              application: "pos",
              queriedPeriod: { from: "2026-06-01", to: "2026-06-08" },
            },
          },
        },
      ],
      "Asia/Riyadh"
    )

    expect(result!.contributions).toEqual([
      {
        label: "card",
        dimension: "payment_method",
        currentValue: 50,
        previousValue: 200,
        delta: -150,
        contributionSharePercent: 65.2,
      },
      {
        label: "cash",
        dimension: "payment_method",
        currentValue: 100,
        previousValue: 20,
        delta: 80,
        contributionSharePercent: 34.8,
      },
    ])

    // Genie-level quality audit section 6: contribution mode must not ALSO render a bar chart
    // (raw current values, not the change the question was actually about) or narrate every
    // contributor a second time in prose -- contributions[] above is the single ranked source.
    expect(result!.charts).toHaveLength(0)
    expect(result!.insights).toHaveLength(1)
    expect(result!.insights[0].statement).toContain("card")

    // Final-polish audit section 2: an analytical heading, not a dataset label -- derived from
    // the dimension/metric already in the result, naming the direction of the NET change
    // (card -150 + cash +80 = -70 net, so "انخفاض"/decline).
    expect(result!.contributionsTitle).toBe(
      "أكبر المساهمين في انخفاض إجمالي المبيعات حسب payment_method"
    )
    expect(result!.followUpQuestions).toEqual([
      "هل هناك عامل آخر ساهم في هذا التغيّر؟",
      "ما إجمالي إجمالي المبيعات لهذه الفترة؟",
    ])
  })

  // Sibling of the test above: a PLAIN ranking (groupByDimension alone, no compareEnabled) has
  // no delta to speak of, so the chart is still the right -- and only -- representation. Proves
  // the contribution-mode suppression above is scoped to comparison data, not rankings in general.
  it("still renders a bar chart for a plain ranking with no compareEnabled (no delta data)", () => {
    const result = buildStructuredResponse(
      [
        {
          tool: "run_kpi_preview",
          output: {
            points: [
              { label: "card", value: 200 },
              { label: "cash", value: 50 },
            ],
            currentValue: 250,
            previousValue: null,
            changePercent: null,
            sampleSize: 10,
            meta: {
              dataSourceLabel: "المبيعات",
              fieldLabel: "إجمالي المبيعات",
              groupByDimensionLabel: "payment_method",
              application: "pos",
              queriedPeriod: { from: "2026-06-01", to: "2026-06-08" },
            },
          },
        },
      ],
      "Asia/Riyadh"
    )

    expect(result!.charts).toHaveLength(1)
    expect(result!.contributions).toHaveLength(0)
    expect(result!.insights).toHaveLength(0)

    // Final-polish audit section 2: "أعلى قيم <field> حسب <dimension>" instead of the old
    // "<dataSourceLabel> -- <fieldLabel> حسب <dimensionLabel>" dataset-naming boilerplate.
    expect(result!.charts[0].title).toBe("أعلى قيم إجمالي المبيعات حسب payment_method")
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

  describe("data quality warnings", () => {
    function comparisonWith(
      overrides: Partial<PeriodComparisonResult> = {}
    ): PeriodComparisonResult {
      return {
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
        confidence: "high",
        ...overrides,
      }
    }

    it("warns when the current period hasn't finished yet", () => {
      const now = new Date("2026-10-03T12:00:00Z")
      const comparison = comparisonWith({
        period: {
          current: { from: "2026-10-01", to: "2026-10-03" },
          previous: { from: "2026-09-28", to: "2026-09-30" },
        },
      })
      // buildStructuredResponse calls describePeriodFairness with its own `new Date()` default --
      // freeze time for this assertion only, restored immediately after.
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(now)
      const result = buildStructuredResponse(
        [{ tool: "compare_campaign_periods", output: comparison }],
        "UTC"
      )
      vi.useRealTimers()

      expect(result!.warnings.some((w) => w.type === "incomplete_period")).toBe(true)
    })

    it("does not warn about incompleteness when the current period has already fully elapsed", () => {
      const comparison = comparisonWith({
        period: {
          current: { from: "2026-08-01", to: "2026-08-31" },
          previous: { from: "2026-07-01", to: "2026-07-31" },
        },
      })
      const result = buildStructuredResponse(
        [{ tool: "compare_campaign_periods", output: comparison }],
        "UTC"
      )
      expect(result!.warnings.some((w) => w.type === "incomplete_period")).toBe(false)
    })

    it("surfaces a stale-sync warning from channel freshness instead of dropping it silently", () => {
      const comparison = comparisonWith({
        freshness: [
          {
            channel: "Meta Ads",
            connected: true,
            lastSyncedAt: "2026-08-01T00:00:00Z",
            minutesSinceSync: 4000,
            isStale: true,
          },
          {
            channel: "Google Ads",
            connected: true,
            lastSyncedAt: "2026-09-30T00:00:00Z",
            minutesSinceSync: 5,
            isStale: false,
          },
        ],
      })
      const result = buildStructuredResponse(
        [{ tool: "compare_campaign_periods", output: comparison }],
        "Asia/Riyadh"
      )
      const staleWarnings = result!.warnings.filter((w) => w.type === "stale_sync")
      expect(staleWarnings).toHaveLength(1)
      expect(staleWarnings[0].message).toContain("Meta Ads")
    })

    it("warns about insufficient sample size when confidence is insufficient", () => {
      const comparison = comparisonWith({ confidence: "insufficient" })
      const result = buildStructuredResponse(
        [{ tool: "compare_campaign_periods", output: comparison }],
        "Asia/Riyadh"
      )
      expect(result!.warnings.some((w) => w.type === "insufficient_sample")).toBe(true)
    })
  })

  describe("follow-up questions", () => {
    it("generates contextual, deduplicated follow-up questions capped at 4", () => {
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
        confidence: "high",
      }
      const result = buildStructuredResponse(
        [{ tool: "compare_campaign_periods", output: comparison }],
        "Asia/Riyadh"
      )
      expect(result!.followUpQuestions.length).toBeGreaterThan(0)
      expect(result!.followUpQuestions.length).toBeLessThanOrEqual(3)
      expect(new Set(result!.followUpQuestions).size).toBe(result!.followUpQuestions.length)
    })

    it("names the actual declining campaign in its follow-up question instead of a generic phrase", () => {
      const rows = [
        {
          id: "camp-1",
          name: "Summer Sale",
          platform: "Google Search",
          status: "Active",
          metrics: snapshot(),
          sampleSize: { spend: 5000, clicks: 500, conversions: 20, days: 30 },
          confidence: "high" as const,
          previousMetrics: snapshot(),
          deltas: [],
        },
      ]
      const result = buildStructuredResponse(
        [{ tool: "get_campaign_declines", output: rows }],
        "Asia/Riyadh"
      )
      expect(result!.followUpQuestions.some((q) => q.includes("Summer Sale"))).toBe(true)
      // Analytical-title fix (audit item 5): names the actual metric this view ranks declining
      // campaigns by, instead of a generic "الحملات المتراجعة" label.
      expect(result!.charts[0].title).toBe("الحملات الأكثر تراجعًا في ROAS")
    })

    it("returns an empty array when no tool has a registered follow-up template", () => {
      const result = buildStructuredResponse(
        [{ tool: "get_campaign_scaling_signals", output: [] }],
        "Asia/Riyadh"
      )
      expect(result!.followUpQuestions).toEqual([])
    })
  })

  describe("identify_performance_drivers", () => {
    it("ranks drivers by magnitude into primary/secondary typed findings with real evidence", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "identify_performance_drivers",
            output: {
              comparison: {
                period: {
                  current: { from: "2026-09-01", to: "2026-09-30" },
                  previous: { from: "2026-08-01", to: "2026-08-31" },
                },
                confidence: "high",
              },
              drivers: [
                {
                  metric: "cpc",
                  current: 6.5,
                  previous: 5,
                  changePercent: 30,
                  changeAbsolute: 1.5,
                  direction: "up",
                  magnitudeRank: 1,
                  narrative: "أكبر تغيّر ملحوظ هو ارتفاع cpc بنسبة 30%.",
                  funnelStage: null,
                },
                {
                  metric: "ctr",
                  current: 1.5,
                  previous: 2,
                  changePercent: -25,
                  changeAbsolute: -0.5,
                  direction: "down",
                  magnitudeRank: 2,
                  narrative: "انخفض ctr أيضًا بنسبة 25%.",
                  funnelStage: "engagement",
                },
              ],
            },
          },
        ],
        "Asia/Riyadh"
      )

      expect(result!.drivers).toHaveLength(2)
      expect(result!.drivers[0]).toEqual({
        metric: "cpc",
        role: "primary",
        direction: "up",
        changePercent: 30,
        statement: "أكبر تغيّر ملحوظ هو ارتفاع cpc بنسبة 30%.",
        evidence: [{ metric: "cpc", current: 6.5, previous: 5, changePercent: 30 }],
        confidence: "medium",
      })
      expect(result!.drivers[1].role).toBe("secondary")
      expect(result!.drivers[1].evidence).toEqual([
        { metric: "ctr", current: 1.5, previous: 2, changePercent: -25 },
      ])
    })
  })

  describe("analyze_sales_performance (POS)", () => {
    function posAnalysis(overrides: Record<string, unknown> = {}) {
      return {
        comparison: {
          period: {
            current: { from: "2026-09-01", to: "2026-09-30" },
            previous: { from: "2026-08-01", to: "2026-08-31" },
          },
          current: { revenue: 400, orders: 1, aov: 400 },
          previous: { revenue: 2100, orders: 4, aov: 525 },
          revenueChangePercent: -81,
          ordersChangePercent: -75,
          aovChangePercent: -23.8,
          decomposition: {
            revenueChange: -1700,
            orderEffect: -1575,
            aovEffect: -125,
            orderEffectPercent: 92.6,
            aovEffectPercent: 7.4,
            dominantDriver: "orders",
          },
          confidence: "medium",
          periodFairness: { isCurrentPeriodIncomplete: false, elapsedDays: 30 },
          ...overrides,
        },
        productContributions: [
          {
            productName: "Product A",
            currentRevenue: 100,
            previousRevenue: 500,
            revenueDelta: -400,
          },
        ],
      }
    }

    it("builds KPI cards, a decomposition insight naming the dominant driver, and typed contributions (no duplicate table)", () => {
      const result = buildStructuredResponse(
        [{ tool: "analyze_sales_performance", output: posAnalysis() }],
        "Asia/Riyadh"
      )

      expect(result).not.toBeNull()
      expect(result!.source).toEqual({ domain: "pos" })
      expect(result!.confidence).toBe("medium")
      expect(result!.metrics).toHaveLength(3)
      const revenueCard = result!.metrics.find((m) => m.title === "الإيرادات")!
      expect(revenueCard.value).toBe(400)
      expect(revenueCard.trend).toBe("down")

      expect(result!.insights).toHaveLength(1)
      expect(result!.insights[0].statement).toContain("عدد الطلبات")
      expect(result!.insights[0].statement).toContain("92.6%")

      // Genie-level quality audit section 6: no parallel ReportTable repeating this same
      // product-contribution data -- contributions[] below is the single structured
      // representation (it carries strictly more: contributionSharePercent).
      expect(result!.tables).toHaveLength(0)
      expect(result!.drivers).toHaveLength(2)
      const ordersDriver = result!.drivers.find((d) => d.metric === "orders")!
      expect(ordersDriver.role).toBe("primary")
      expect(ordersDriver.direction).toBe("down")
      expect(ordersDriver.evidence).toEqual([
        { metric: "orders", current: 1, previous: 4, changePercent: -75 },
      ])
      const aovDriver = result!.drivers.find((d) => d.metric === "aov")!
      expect(aovDriver.role).toBe("secondary")

      expect(result!.contributions).toEqual([
        {
          label: "Product A",
          dimension: "product",
          currentValue: 100,
          previousValue: 500,
          delta: -400,
          contributionSharePercent: 100,
        },
      ])

      // Final-polish audit section 2: an analytical heading naming the actual direction (the
      // single contributor's delta is -400, so "انخفاض"/decline) and metric, not a generic
      // "contributions" label.
      expect(result!.contributionsTitle).toBe("أكبر المساهمين في انخفاض الإيرادات حسب المنتج")

      // Genie-level analytical response upgrade section 8: POS had no evidence-based
      // recommendation at all before this -- Product A is 100% of the (single-product) decline,
      // clearing the dominant-contributor threshold, so the recommendation should name it by
      // entity rather than just the account-level driver.
      expect(result!.recommendations).toHaveLength(1)
      expect(result!.recommendations[0].type).toBe("investigate_decline")
      expect(result!.recommendations[0].entityType).toBe("product")
      expect(result!.recommendations[0].entityName).toBe("Product A")
      expect(result!.recommendations[0].confidence).toBe("medium")
      expect(result!.recommendations[0].reason).toContain("Product A")
    })

    it("recommends the account-level driver (not a specific product) when no single product dominates the decline", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "analyze_sales_performance",
            output: {
              ...posAnalysis(),
              // 5 contributors each at 20% of the total decline -- below the 25% dominant-
              // contributor threshold, so no single product should be named.
              productContributions: Array.from({ length: 5 }, (_, i) => ({
                productName: `Product ${i}`,
                currentRevenue: 20,
                previousRevenue: 100,
                revenueDelta: -80,
              })),
            },
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.recommendations).toHaveLength(1)
      expect(result!.recommendations[0].entityType).toBe("account")
      expect(result!.recommendations[0].entityId).toBeNull()
      expect(result!.recommendations[0].entityName).toBe("نقطة البيع")
      expect(result!.recommendations[0].reason).not.toContain("Product")
    })

    it("returns an insufficient-data recommendation, never a stronger one, when confidence is insufficient", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "analyze_sales_performance",
            output: posAnalysis({ confidence: "insufficient" }),
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.recommendations).toHaveLength(1)
      expect(result!.recommendations[0].type).toBe("no_action")
      expect(result!.recommendations[0].confidence).toBe("insufficient")
      expect(result!.recommendations[0].recommendedAction).toBe(
        "لا توجد بيانات كافية لإعطاء توصية موثوقة."
      )
    })

    it("notes positive performance with a no_action recommendation when revenue grew materially", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "analyze_sales_performance",
            output: posAnalysis({ revenueChangePercent: 25 }),
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.recommendations).toHaveLength(1)
      expect(result!.recommendations[0].type).toBe("no_action")
      expect(result!.recommendations[0].reason).toContain("ارتفعت")
    })

    it("returns no recommendation at all when nothing changed (dominantDriver: none)", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "analyze_sales_performance",
            output: posAnalysis({
              decomposition: {
                revenueChange: 0,
                orderEffect: 0,
                aovEffect: 0,
                orderEffectPercent: null,
                aovEffectPercent: null,
                dominantDriver: "none",
              },
            }),
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.recommendations).toHaveLength(0)
    })

    it("warns when the current period hasn't fully elapsed", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "analyze_sales_performance",
            output: posAnalysis({
              periodFairness: { isCurrentPeriodIncomplete: true, elapsedDays: 3 },
            }),
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.warnings.some((w) => w.type === "incomplete_period")).toBe(true)
    })

    it("emits no decomposition insight when nothing changed", () => {
      const result = buildStructuredResponse(
        [
          {
            tool: "analyze_sales_performance",
            output: posAnalysis({
              decomposition: {
                revenueChange: 0,
                orderEffect: 0,
                aovEffect: 0,
                orderEffectPercent: null,
                aovEffectPercent: null,
                dominantDriver: "none",
              },
            }),
          },
        ],
        "Asia/Riyadh"
      )
      expect(result!.insights).toHaveLength(0)
    })
  })
})
