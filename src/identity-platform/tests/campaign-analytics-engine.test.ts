// @vitest-environment node
//
// Unit tests for the deterministic campaign analytics layer (analytics-engine.ts,
// confidence-engine.ts, recommendation-engine.ts). These use hand-built fakes for
// CampaignsPerformanceAggregationService/ChannelsAggregationService rather than seeding real
// synced-ad tables -- the thing under test here is the ARITHMETIC and EDGE-CASE handling on top
// of whatever those services return, which is exactly what section 29/30 of the audit asked to
// be verified in isolation from the (already-tested elsewhere) data-sync layer.

import { randomUUID } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { CampaignAnalyticsEngine, defaultComparisonRanges } from "../campaigns/analytics-engine"
import { combineConfidence, computeConfidence } from "../campaigns/confidence-engine"
import {
  generateAccountRecommendation,
  generateContributionRecommendations,
} from "../campaigns/recommendation-engine"
import type {
  CampaignPerformancePlatformRow,
  CampaignPerformanceQuery,
  CampaignPerformanceRow,
  CampaignPerformanceSummary,
  CampaignsPerformanceAggregationService,
} from "../campaigns/performance-service"
import type { ChannelsAggregationService } from "../channels/channels-service"

function actor(): AuthenticatedActor {
  return {
    userId: randomUUID(),
    sessionId: randomUUID(),
    organizationId: randomUUID(),
    workspaceId: null,
    roles: ["owner"],
    modulePermissions: ["ai:view"],
  }
}

function summary(overrides: Partial<CampaignPerformanceSummary> = {}): CampaignPerformanceSummary {
  return {
    impressions: 100_000,
    impressionsChangePct: null,
    clicks: 2_000,
    clicksChangePct: null,
    ctr: 2,
    ctrChangePct: null,
    spend: 10_000,
    spendChangePct: null,
    revenue: 40_000,
    revenueChangePct: null,
    roas: 4,
    roasChangePct: null,
    conversions: 200,
    conversionsChangePct: null,
    cpa: 50,
    cpaChangePct: null,
    conversionRate: 10,
    conversionRateChangePct: null,
    activeCampaigns: 5,
    activeCampaignsChangePct: null,
    ...overrides,
  }
}

function campaignRow(overrides: Partial<CampaignPerformanceRow> = {}): CampaignPerformanceRow {
  return {
    id: overrides.id ?? `google_ads:${randomUUID()}`,
    parentId: null,
    platform: "Google Search",
    level: "campaign",
    name: "Campaign",
    status: "Active",
    objective: null,
    activityDate: "2026-09-15",
    currency: null,
    spend: 1000,
    revenue: 4000,
    roas: 4,
    clicks: 200,
    conversions: 20,
    conversionRate: 10,
    ctr: 2,
    cpc: 5,
    cpa: 50,
    impressions: 10_000,
    cost: 1000,
    qualityScore: 0,
    impressionShare: 0,
    searchTopImpressionRate: 0,
    cpm: 100,
    viewableImpressions: 0,
    viewability: 0,
    views: 0,
    viewRate: 0,
    watchTime: 0,
    averageViewDuration: 0,
    view25: 0,
    view50: 0,
    view75: 0,
    view100Completion: 0,
    reach: 0,
    frequency: 0,
    videoPlays: 0,
    threeSecondViews: 0,
    thruPlays: 0,
    addToCart: 0,
    checkoutStarted: 0,
    purchases: 0,
    purchaseValue: 0,
    ...overrides,
  }
}

function platformRow(
  overrides: Partial<CampaignPerformancePlatformRow> = {}
): CampaignPerformancePlatformRow {
  return {
    ...campaignRow(),
    activeCampaigns: 1,
    otherCurrencies: [],
    ...overrides,
  } as CampaignPerformancePlatformRow
}

interface FakeServices {
  performanceService: CampaignsPerformanceAggregationService
  channelsService: ChannelsAggregationService
  getSummaryMock: ReturnType<typeof vi.fn>
  listCampaignsMock: ReturnType<typeof vi.fn>
  getPlatformBreakdownMock: ReturnType<typeof vi.fn>
}

function buildFakeServices(): FakeServices {
  const getSummaryMock = vi.fn()
  const listCampaignsMock = vi.fn()
  const getPlatformBreakdownMock = vi.fn()
  const getAlertsMock = vi.fn().mockResolvedValue({ items: [] })
  const getConnectionFreshnessMock = vi.fn().mockResolvedValue({
    "Google Ads": { connected: true, lastSyncedAt: new Date().toISOString() },
    "Meta Ads": { connected: false, lastSyncedAt: null },
    "TikTok Ads": { connected: false, lastSyncedAt: null },
    Snapchat: { connected: false, lastSyncedAt: null },
  })

  const performanceService = {
    getSummary: getSummaryMock,
    listCampaigns: listCampaignsMock,
    getPlatformBreakdown: getPlatformBreakdownMock,
  } as unknown as CampaignsPerformanceAggregationService

  const channelsService = {
    getAlerts: getAlertsMock,
    getConnectionFreshness: getConnectionFreshnessMock,
  } as unknown as ChannelsAggregationService

  return {
    performanceService,
    channelsService,
    getSummaryMock,
    listCampaignsMock,
    getPlatformBreakdownMock,
  }
}

describe("metric derivation", () => {
  it("derives CPC and CPM safely when clicks/impressions are zero", async () => {
    const { performanceService, channelsService, getSummaryMock } = buildFakeServices()
    getSummaryMock.mockResolvedValue(summary({ clicks: 0, impressions: 0, spend: 500 }))
    const engine = new CampaignAnalyticsEngine(performanceService, channelsService)

    const result = await engine.getCampaignSummary(actor(), {})
    expect(result.metrics.cpc).toBe(0)
    expect(result.metrics.cpm).toBe(0)
    expect(Number.isFinite(result.metrics.cpc)).toBe(true)
    expect(Number.isFinite(result.metrics.cpm)).toBe(true)
  })

  it("never produces Infinity or NaN when revenue/spend/clicks are all zero", async () => {
    const { performanceService, channelsService, getSummaryMock } = buildFakeServices()
    getSummaryMock.mockResolvedValue(
      summary({
        spend: 0,
        revenue: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        roas: 0,
        cpa: 0,
        conversionRate: 0,
      })
    )
    const engine = new CampaignAnalyticsEngine(performanceService, channelsService)
    const result = await engine.getCampaignSummary(actor(), {})
    for (const value of Object.values(result.metrics)) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })
})

describe("period comparison", () => {
  function engineWithSummaries(
    current: CampaignPerformanceSummary,
    previous: CampaignPerformanceSummary
  ) {
    const { performanceService, channelsService, getSummaryMock } = buildFakeServices()
    getSummaryMock.mockImplementation((_actor: unknown, query: CampaignPerformanceQuery) =>
      Promise.resolve(query.startDate === "2026-09-01" ? current : previous)
    )
    return new CampaignAnalyticsEngine(performanceService, channelsService)
  }

  const ranges = {
    current: { from: "2026-09-01", to: "2026-09-30" },
    previous: { from: "2026-08-01", to: "2026-08-31" },
  }

  it("computes a positive change correctly", async () => {
    const engine = engineWithSummaries(summary({ spend: 12_500 }), summary({ spend: 10_000 }))
    const result = await engine.comparePeriods(actor(), ranges)
    const spendDelta = result.deltas.find((d) => d.metric === "spend")!
    expect(spendDelta.current).toBe(12_500)
    expect(spendDelta.previous).toBe(10_000)
    expect(spendDelta.changePercent).toBe(25)
  })

  it("computes a negative change correctly", async () => {
    const engine = engineWithSummaries(summary({ roas: 3.36 }), summary({ roas: 4 }))
    const result = await engine.comparePeriods(actor(), ranges)
    const roasDelta = result.deltas.find((d) => d.metric === "roas")!
    expect(roasDelta.changePercent).toBeCloseTo(-16, 0)
  })

  it("returns null changePercent (not Infinity) when the previous value was zero", async () => {
    const engine = engineWithSummaries(summary({ spend: 500 }), summary({ spend: 0 }))
    const result = await engine.comparePeriods(actor(), ranges)
    const spendDelta = result.deltas.find((d) => d.metric === "spend")!
    expect(spendDelta.changePercent).toBeNull()
    expect(Number.isFinite(spendDelta.changeAbsolute)).toBe(true)
  })

  it("returns 0% change (not null) when both current and previous are zero", async () => {
    const engine = engineWithSummaries(summary({ spend: 0 }), summary({ spend: 0 }))
    const result = await engine.comparePeriods(actor(), ranges)
    const spendDelta = result.deltas.find((d) => d.metric === "spend")!
    expect(spendDelta.changePercent).toBe(0)
  })

  it("marks confidence insufficient when sample size is tiny on either side", async () => {
    const engine = engineWithSummaries(
      summary({ spend: 15, clicks: 3, conversions: 0 }),
      summary({ spend: 10_000, clicks: 2_000, conversions: 200 })
    )
    const result = await engine.comparePeriods(actor(), ranges)
    expect(result.confidence).toBe("insufficient")
  })

  it("defaultComparisonRanges mirrors an equal-length previous period", () => {
    const ranges2 = defaultComparisonRanges({ currentFrom: "2026-09-01", currentTo: "2026-09-30" })
    expect(ranges2.previous.to).toBe("2026-08-31")
    expect(ranges2.previous.from).toBe("2026-08-02")
  })
})

describe("campaign ranking", () => {
  it("excludes campaigns with insufficient sample size from ranking", async () => {
    const { performanceService, channelsService, listCampaignsMock } = buildFakeServices()
    listCampaignsMock.mockResolvedValue({
      items: [
        campaignRow({
          id: "a",
          name: "Big Campaign",
          spend: 5000,
          clicks: 1000,
          conversions: 50,
          roas: 5,
        }),
        campaignRow({
          id: "b",
          name: "Tiny Campaign",
          spend: 5,
          clicks: 2,
          conversions: 0,
          roas: 50,
        }),
      ],
      pagination: { page: 1, pageSize: 200, total: 2 },
    })
    const engine = new CampaignAnalyticsEngine(performanceService, channelsService)

    const ranking = await engine.getCampaignRanking(actor(), {
      query: { startDate: "2026-09-01", endDate: "2026-09-30" },
      metric: "roas",
      direction: "top",
      limit: 5,
    })

    expect(ranking.map((r) => r.id)).toEqual(["a"])
  })

  it("ranks by the requested metric in the requested direction", async () => {
    const { performanceService, channelsService, listCampaignsMock } = buildFakeServices()
    listCampaignsMock.mockResolvedValue({
      items: [
        campaignRow({ id: "a", spend: 2000, clicks: 300, conversions: 20, roas: 2 }),
        campaignRow({ id: "b", spend: 2000, clicks: 300, conversions: 20, roas: 6 }),
      ],
      pagination: { page: 1, pageSize: 200, total: 2 },
    })
    const engine = new CampaignAnalyticsEngine(performanceService, channelsService)

    const top = await engine.getCampaignRanking(actor(), {
      query: {},
      metric: "roas",
      direction: "top",
      limit: 5,
    })
    expect(top[0].id).toBe("b")

    const bottom = await engine.getCampaignRanking(actor(), {
      query: {},
      metric: "roas",
      direction: "bottom",
      limit: 5,
    })
    expect(bottom[0].id).toBe("a")
  })
})

describe("campaign declines", () => {
  it("joins current/previous periods by campaign id and only returns declining campaigns", async () => {
    const { performanceService, channelsService, listCampaignsMock } = buildFakeServices()
    listCampaignsMock.mockImplementation((_actor: unknown, query: CampaignPerformanceQuery) => {
      if (query.startDate === "2026-09-01") {
        return Promise.resolve({
          items: [
            campaignRow({ id: "declining", spend: 2000, clicks: 300, conversions: 10, roas: 2 }),
            campaignRow({ id: "improving", spend: 2000, clicks: 300, conversions: 40, roas: 8 }),
            campaignRow({ id: "new-campaign", spend: 2000, clicks: 300, conversions: 10, roas: 2 }),
          ],
          pagination: { page: 1, pageSize: 200, total: 3 },
        })
      }
      return Promise.resolve({
        items: [
          campaignRow({ id: "declining", spend: 2000, clicks: 300, conversions: 40, roas: 8 }),
          campaignRow({ id: "improving", spend: 2000, clicks: 300, conversions: 10, roas: 2 }),
        ],
        pagination: { page: 1, pageSize: 200, total: 2 },
      })
    })
    const engine = new CampaignAnalyticsEngine(performanceService, channelsService)

    const declines = await engine.getCampaignDeclines(actor(), {
      ranges: {
        current: { from: "2026-09-01", to: "2026-09-30" },
        previous: { from: "2026-08-01", to: "2026-08-31" },
      },
      metric: "roas",
      limit: 5,
    })

    expect(declines.map((d) => d.id)).toEqual(["declining"])
    // "new-campaign" (no previous-period match) must never appear -- a 0->X comparison isn't a
    // real trend.
    expect(declines.find((d) => d.id === "new-campaign")).toBeUndefined()
  })
})

describe("performance drivers", () => {
  it("ranks candidate metrics by magnitude and never names the target metric itself as a driver", async () => {
    const { performanceService, channelsService, getSummaryMock } = buildFakeServices()
    getSummaryMock.mockImplementation((_actor: unknown, query: CampaignPerformanceQuery) =>
      Promise.resolve(
        query.startDate === "2026-09-01"
          ? summary({ roas: 3.7, spend: 13_200, revenue: 42_000 })
          : summary({ roas: 4.6, spend: 10_000, revenue: 40_000 })
      )
    )
    const engine = new CampaignAnalyticsEngine(performanceService, channelsService)
    const comparison = await engine.comparePeriods(actor(), {
      current: { from: "2026-09-01", to: "2026-09-30" },
      previous: { from: "2026-08-01", to: "2026-08-31" },
    })

    const drivers = engine.identifyPerformanceDrivers(comparison, "roas")
    expect(drivers.find((d) => d.metric === "roas")).toBeUndefined()
    expect(drivers[0].magnitudeRank).toBe(1)
    // Never a causal assertion -- only hedged, associative language.
    for (const driver of drivers) {
      expect(driver.narrative).not.toMatch(/كان السبب|تسبب في/)
    }
  })
})

describe("confidence engine", () => {
  it("returns insufficient below the lowest band", () => {
    expect(computeConfidence({ spend: 1, clicks: 1, conversions: 0, days: 1 })).toBe("insufficient")
  })

  it("returns high once every threshold is met", () => {
    expect(computeConfidence({ spend: 5000, clicks: 500, conversions: 20, days: 10 })).toBe("high")
  })

  it("combineConfidence takes the weaker of the two sides", () => {
    expect(combineConfidence("high", "low")).toBe("low")
    expect(combineConfidence("insufficient", "high")).toBe("insufficient")
  })
})

describe("recommendation engine", () => {
  const period = {
    current: { from: "2026-09-01", to: "2026-09-30" },
    previous: { from: "2026-08-01", to: "2026-08-31" },
  }

  it("recommends budget review on a material ROAS decline with sufficient confidence", () => {
    const comparison = {
      period,
      current: { ...summary({ roas: 3.0 }) } as never,
      previous: { ...summary({ roas: 4.6 }) } as never,
      deltas: [
        {
          metric: "roas" as const,
          current: 3.0,
          previous: 4.6,
          changePercent: -35,
          changeAbsolute: -1.6,
        },
        {
          metric: "spend" as const,
          current: 13000,
          previous: 10000,
          changePercent: 30,
          changeAbsolute: 3000,
        },
      ],
      freshness: [],
      sampleSize: { spend: 13000, clicks: 2000, conversions: 100, days: 30 },
      confidence: "high" as const,
    }
    const rec = generateAccountRecommendation(comparison, [])
    expect(rec.type).toBe("budget_review")
    expect(rec.confidence).toBe("high")
    expect(rec.recommendedAction).not.toMatch(/\d+%/)
  })

  it("refuses to recommend anything but 'insufficient data' when confidence is insufficient", () => {
    const comparison = {
      period,
      current: {} as never,
      previous: {} as never,
      deltas: [
        {
          metric: "roas" as const,
          current: 1,
          previous: 10,
          changePercent: -90,
          changeAbsolute: -9,
        },
      ],
      freshness: [],
      sampleSize: { spend: 5, clicks: 2, conversions: 0, days: 1 },
      confidence: "insufficient" as const,
    }
    const rec = generateAccountRecommendation(comparison, [])
    expect(rec.type).toBe("no_action")
    expect(rec.recommendedAction).toBe("لا توجد بيانات كافية لإعطاء توصية موثوقة.")
  })

  it("recommends no action when ROAS change is within normal range (conflicting/weak signal)", () => {
    const comparison = {
      period,
      current: {} as never,
      previous: {} as never,
      deltas: [
        {
          metric: "roas" as const,
          current: 4.1,
          previous: 4.0,
          changePercent: 2.5,
          changeAbsolute: 0.1,
        },
      ],
      freshness: [],
      sampleSize: { spend: 5000, clicks: 500, conversions: 20, days: 10 },
      confidence: "high" as const,
    }
    const rec = generateAccountRecommendation(comparison, [])
    expect(rec.type).toBe("no_action")
  })

  it("never recommends a specific percentage budget change", () => {
    const rows = [
      {
        entityId: "c1",
        entityName: "Campaign B",
        spend: 50000,
        revenue: 60000,
        spendShare: 0.5,
        revenueShare: 0.3,
        revenueDeltaAbsolute: -5000,
        roasDeteriorationScore: 4000,
      },
    ]
    const recs = generateContributionRecommendations(rows, period, "high")
    expect(recs).toHaveLength(1)
    expect(recs[0].recommendedAction).not.toMatch(/\d+%/)
    expect(recs[0].recommendedAction).not.toMatch(/زيادة الميزانية بنسبة/)
  })
})

describe("channel comparison", () => {
  it("only returns channels the underlying service reports as having campaigns", async () => {
    const { performanceService, channelsService, getPlatformBreakdownMock } = buildFakeServices()
    getPlatformBreakdownMock.mockResolvedValue([
      platformRow({ platform: "Google Search", activeCampaigns: 3 }),
    ])
    const engine = new CampaignAnalyticsEngine(performanceService, channelsService)
    const rows = await engine.getChannelComparison(actor(), {})
    expect(rows).toHaveLength(1)
    expect(rows[0].channel).toBe("Google Search")
  })
})

describe("caching", () => {
  it("serves the second identical call from cache instead of calling the underlying service again", async () => {
    const { performanceService, channelsService, getSummaryMock } = buildFakeServices()
    getSummaryMock.mockResolvedValue(summary())
    const store = new Map<string, string>()
    const cache = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value)
      }),
    }
    const engine = new CampaignAnalyticsEngine(performanceService, channelsService, cache)
    const act = actor()
    await engine.getCampaignSummary(act, { startDate: "2026-09-01", endDate: "2026-09-30" })
    await engine.getCampaignSummary(act, { startDate: "2026-09-01", endDate: "2026-09-30" })
    expect(getSummaryMock).toHaveBeenCalledTimes(1)
  })

  it("never shares a cache entry across organizations", async () => {
    const { performanceService, channelsService, getSummaryMock } = buildFakeServices()
    getSummaryMock.mockResolvedValue(summary())
    const store = new Map<string, string>()
    const cache = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value)
      }),
    }
    const engine = new CampaignAnalyticsEngine(performanceService, channelsService, cache)
    await engine.getCampaignSummary(actor(), { startDate: "2026-09-01", endDate: "2026-09-30" })
    await engine.getCampaignSummary(actor(), { startDate: "2026-09-01", endDate: "2026-09-30" })
    expect(getSummaryMock).toHaveBeenCalledTimes(2)
  })
})
