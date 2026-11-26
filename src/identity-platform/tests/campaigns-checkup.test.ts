import { describe, expect, it } from "vitest"

import { buildCheckup } from "../campaigns/checkup"
import type { CampaignPerformanceRow } from "../campaigns/performance-service"

// The check-up only raises findings about what is running now: an ad or a campaign someone
// already stopped keeps its numbers in the tables but is never the subject of a warning.

const row = (values: Partial<CampaignPerformanceRow>): CampaignPerformanceRow => {
  const spend = values.spend ?? 0
  const impressions = values.impressions ?? 0
  const clicks = values.clicks ?? 0
  const conversions = values.conversions ?? 0
  return {
    parentId: null,
    platform: "snapchat",
    level: "campaign",
    status: "ACTIVE",
    objective: null,
    activityDate: null,
    currency: "SAR",
    revenue: 0,
    roas: 0,
    conversionRate: 0,
    cpc: 0,
    pageViews: null,
    dailyBudget: null,
    ...values,
    spend,
    impressions,
    clicks,
    conversions,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
  } as CampaignPerformanceRow
}

const checkup = (
  campaigns: CampaignPerformanceRow[],
  ads: Record<string, CampaignPerformanceRow[]>,
  stoppedAdSetIds: string[] = []
) =>
  buildCheckup({
    campaigns,
    spendTodayByCampaignId: new Map(),
    spendYesterdayByCampaignId: new Map(),
    adsByCampaignId: new Map(Object.entries(ads)),
    adSetBudgetByCampaignId: new Map(),
    stoppedAdSetIds: new Set(stoppedAdSetIds),
    range: { startDate: "2026-11-01", endDate: "2026-11-23", days: 23 },
  })

// The warnings only (high / medium) -- stage notes such as "promising" are not warnings.
const warnings = (result: ReturnType<typeof checkup>) =>
  result.findings.filter((finding) => finding.severity === "high" || finding.severity === "medium")

const ad = (id: string, values: Partial<CampaignPerformanceRow>) =>
  row({ id, name: id, level: "ad", parentId: "set", ...values })

describe("campaign check-up: only what is running gets a finding", () => {
  // One ad took 88% of the money and brought nobody; the other brought a result cheaply.
  const hog = { spend: 159, impressions: 20_000, clicks: 100 }
  const good = { spend: 21.25, impressions: 2_000, clicks: 30, conversions: 1 }
  const totals = { spend: 180.25, impressions: 22_000, clicks: 130, conversions: 1 }

  it("says nothing about the ads of a campaign that is switched off", () => {
    const result = checkup([row({ id: "c", name: "Leads", status: "PAUSED", ...totals })], {
      c: [ad("hog", hog), ad("good", good)],
    })
    expect(result.findings).toEqual([])
    // Still listed with their numbers, marked as not running.
    expect(result.ads.map((entry) => [entry.name, entry.running])).toEqual([
      ["hog", false],
      ["good", false],
    ])
  })

  it("says nothing about an ad that is switched off inside a running campaign", () => {
    const result = checkup([row({ id: "c", name: "Leads", ...totals })], {
      c: [ad("hog", { ...hog, status: "PAUSED" }), ad("good", good)],
    })
    expect(warnings(result)).toEqual([])
    expect(result.ads.find((entry) => entry.name === "good")?.running).toBe(true)
  })

  it("says nothing about the ads of an ad set that is switched off", () => {
    const result = checkup(
      [row({ id: "c", name: "Leads", ...totals })],
      { c: [ad("hog", hog), ad("good", good)] },
      ["set"]
    )
    expect(result.findings).toEqual([])
  })

  it("still reports the same ad while it is running", () => {
    const result = checkup([row({ id: "c", name: "Leads", ...totals })], {
      c: [ad("hog", hog), ad("good", good)],
    })
    expect(warnings(result)).toEqual([
      expect.objectContaining({
        kind: "budget_hog",
        adName: "hog",
        values: expect.objectContaining({ basis: "no_result", share: 88 }),
      }),
    ])
  })

  it("holds a running ad's tap rate against the campaign's other ads, stopped ones included", () => {
    const result = checkup(
      [row({ id: "c", name: "Leads", spend: 60, impressions: 9_000, clicks: 62, conversions: 0 })],
      {
        c: [
          ad("weak", { spend: 20, impressions: 5_000, clicks: 20 }),
          ad("old", { spend: 40, impressions: 4_000, clicks: 42, status: "PAUSED" }),
        ],
      }
    )
    expect(result.findings.map((finding) => [finding.kind, finding.adName])).toEqual([
      ["low_ctr", "weak"],
    ])
  })
})
