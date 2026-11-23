import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import {
  CampaignCheckupService,
  checkupCampaignState,
  type CheckupFinding,
  type CheckupFindingKind,
} from "./checkup"
import type {
  CampaignPerformanceRow,
  CampaignsPerformanceAggregationService,
} from "./performance-service"

// What the AI assistant reads when a question is about something below the campaign: the ads
// themselves, the ad sets that hold the budget and the audience, one ad's numbers day by day,
// and the account check-up (is each campaign running, where people drop, what needs attention).
//
// Everything is read from the rows Madar already syncs, through the same services the campaigns
// screens use, so the assistant and the screens can never disagree. Nothing here is estimated.

export interface AdsInsightsRange {
  startDate?: string
  endDate?: string
}

export interface AdsInsightsFilter {
  // Part of a campaign's name, any letter case.
  campaignName?: string
  // Part of an ad's name, any letter case.
  adName?: string
  // Part of the platform's name: "snapchat", "tiktok", "meta", "google".
  platform?: string
  // Only what is switched on now (the ad, its ad set and its campaign).
  onlyRunning?: boolean
}

export interface AdInsightRow {
  platform: string
  campaign: string
  ad: string
  // "running": switched on, in an ad set and a campaign that are switched on. Else "stopped".
  state: "running" | "stopped"
  spend: number
  // Its part of the campaign's ad spend in the period, 0-100.
  spendSharePercent: number
  impressions: number
  clicks: number
  ctrPercent: number
  costPerClick: number | null
  // Null where the platform does not report landing page visits.
  landingPageViews: number | null
  results: number
  // Null when the ad brought no result: there is no cost of a result to speak of.
  costPerResult: number | null
  currency: string | null
}

export interface AdSetInsightRow {
  platform: string
  campaign: string
  adSet: string
  state: "running" | "stopped"
  dailyBudget: number | null
  spend: number
  impressions: number
  clicks: number
  ctrPercent: number
  results: number
  costPerResult: number | null
  currency: string | null
}

export interface AdDailyRow {
  date: string
  spend: number
  impressions: number
  clicks: number
  ctrPercent: number
  results: number
  costPerResult: number | null
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits))
const contains = (value: string, part: string | undefined) =>
  !part || value.toLowerCase().includes(part.trim().toLowerCase())
const perResult = (spend: number, results: number) => (results > 0 ? round(spend / results) : null)
const percent = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0)

// "Today" as a merchant in Saudi Arabia means it, not the server's UTC day.
const riyadhDay = (instant: Date) =>
  new Date(instant.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

// What each kind of finding means, in words the assistant can pass on.
const FINDING_MEANING: Record<CheckupFindingKind, string> = {
  budget_hog:
    "One running ad takes most of its campaign's spend while doing worse than the other running ads (values.basis: no_result = it brought no result and the others did; cost = its result costs clearly more; ctr = it is tapped clearly less).",
  spend_no_result:
    "A running ad spent at least twice what a result normally costs in this account (values.usualCpa) and brought no result.",
  clicks_no_result:
    "A running campaign has 100+ clicks and no result (values.reason: page_drop = most people leave before the page opens; no_signup = they reach the page and do not finish; unknown = the platform reports no page visits).",
  low_ctr:
    "A running ad is tapped less than half as often as the campaign's other ads (values.adCtr vs values.othersCtr, in percent).",
  budget_reached: "Today's spend has reached the campaign's daily budget.",
  budget_unspent: "A running campaign spent under half its daily budget yesterday.",
  not_delivering:
    "The campaign is switched on but not being shown (in review, rejected or limited).",
}

const MAX_ADS = 40
const MAX_AD_SETS = 40
const MAX_CAMPAIGNS = 12
const MAX_TREND_DAYS = 14
const MAX_TREND_AD_SETS = 6
const MAX_TREND_ADS = 8

export class AdsInsights {
  private readonly checkup: CampaignCheckupService

  constructor(
    private readonly performance: CampaignsPerformanceAggregationService,
    private readonly now: () => Date = () => new Date()
  ) {
    this.checkup = new CampaignCheckupService(performance, now)
  }

  // Every ad with activity in the period, most spend first.
  async ads(
    actor: AuthenticatedActor,
    range: AdsInsightsRange,
    filter: AdsInsightsFilter = {}
  ): Promise<{
    queriedPeriod: { from: string; to: string }
    totals: {
      ads: number
      runningAds: number
      spend: number
      impressions: number
      clicks: number
      results: number
      costPerResult: number | null
    }
    ads: AdInsightRow[]
    // Ads that matched but were left out of `ads` to keep the answer readable.
    omittedAds: number
  }> {
    const result = await this.checkup.run(actor, range)
    const matched = result.ads.filter(
      (ad) =>
        contains(ad.campaignName, filter.campaignName) &&
        contains(ad.name, filter.adName) &&
        contains(ad.platform, filter.platform) &&
        (!filter.onlyRunning || ad.running)
    )
    const spend = matched.reduce((sum, ad) => sum + ad.spend, 0)
    const results = matched.reduce((sum, ad) => sum + ad.conversions, 0)
    return {
      queriedPeriod: { from: result.range.startDate, to: result.range.endDate },
      totals: {
        ads: matched.length,
        runningAds: matched.filter((ad) => ad.running).length,
        spend: round(spend),
        impressions: matched.reduce((sum, ad) => sum + ad.impressions, 0),
        clicks: matched.reduce((sum, ad) => sum + ad.clicks, 0),
        results: round(results),
        costPerResult: perResult(spend, results),
      },
      ads: matched.slice(0, MAX_ADS).map((ad) => ({
        platform: ad.platform,
        campaign: ad.campaignName,
        ad: ad.name,
        state: ad.running ? "running" : "stopped",
        spend: ad.spend,
        spendSharePercent: ad.spendShare,
        impressions: ad.impressions,
        clicks: ad.clicks,
        ctrPercent: ad.ctr,
        costPerClick: ad.clicks > 0 ? round(ad.spend / ad.clicks) : null,
        landingPageViews: ad.pageViews,
        results: ad.conversions,
        costPerResult: perResult(ad.spend, ad.conversions),
        currency: ad.currency,
      })),
      omittedAds: Math.max(0, matched.length - MAX_ADS),
    }
  }

  // The campaigns that matter for a question about what sits inside them: those with activity
  // in the period, or switched on now.
  private async campaignsInScope(
    actor: AuthenticatedActor,
    range: AdsInsightsRange,
    filter: AdsInsightsFilter
  ): Promise<CampaignPerformanceRow[]> {
    const campaigns = await this.performance.listAllCampaignRows(actor, range)
    return campaigns
      .filter(
        (row) =>
          (row.spend > 0 ||
            row.impressions > 0 ||
            checkupCampaignState(row.status) === "running") &&
          contains(row.name, filter.campaignName) &&
          contains(row.platform, filter.platform)
      )
      .sort((a, b) => b.spend - a.spend)
      .slice(0, MAX_CAMPAIGNS)
  }

  // The ad sets (ad groups): where the daily budget and the audience live.
  async adSets(
    actor: AuthenticatedActor,
    range: AdsInsightsRange,
    filter: AdsInsightsFilter = {}
  ): Promise<{ adSets: AdSetInsightRow[]; omittedAdSets: number }> {
    const campaigns = await this.campaignsInScope(actor, range, filter)
    const lists = await Promise.all(
      campaigns.map(async (campaign) => {
        const campaignRunning = checkupCampaignState(campaign.status) === "running"
        return (await this.performance.listAdGroups(actor, campaign.id, range)).items.map(
          (adSet): AdSetInsightRow => ({
            platform: campaign.platform,
            campaign: campaign.name,
            adSet: adSet.name,
            state:
              campaignRunning && checkupCampaignState(adSet.status) === "running"
                ? "running"
                : "stopped",
            dailyBudget: adSet.dailyBudget ?? null,
            spend: round(adSet.spend),
            impressions: adSet.impressions,
            clicks: adSet.clicks,
            ctrPercent: percent(adSet.clicks, adSet.impressions),
            results: round(adSet.conversions),
            costPerResult: perResult(adSet.spend, adSet.conversions),
            currency: campaign.currency,
          })
        )
      })
    )
    const rows = lists
      .flat()
      .filter(
        (row) =>
          (row.spend > 0 || row.impressions > 0 || row.state === "running") &&
          (!filter.onlyRunning || row.state === "running")
      )
      .sort((a, b) => b.spend - a.spend)
    return {
      adSets: rows.slice(0, MAX_AD_SETS),
      omittedAdSets: Math.max(0, rows.length - MAX_AD_SETS),
    }
  }

  // Each ad's numbers day by day, for up to 14 days ending on `endDate` (today by default). This
  // is how a tired ad shows: its tap rate falling or its cost of a result rising across days.
  async adDailyTrend(
    actor: AuthenticatedActor,
    input: { days?: number; endDate?: string } & AdsInsightsFilter
  ): Promise<{
    queriedPeriod: { from: string; to: string }
    ads: Array<{
      platform: string
      campaign: string
      ad: string
      state: "running" | "stopped"
      currency: string | null
      days: AdDailyRow[]
    }>
    omittedAds: number
  }> {
    const count = Math.min(MAX_TREND_DAYS, Math.max(2, input.days ?? 7))
    const endDate = input.endDate ?? riyadhDay(this.now())
    const end = new Date(`${endDate}T00:00:00Z`).getTime()
    const dates = Array.from({ length: count }, (_, index) =>
      new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10)
    )
    const range = { startDate: dates[0], endDate }

    const campaigns = await this.campaignsInScope(actor, range, input)
    const adSets = (
      await Promise.all(
        campaigns.map(async (campaign) =>
          (await this.performance.listAdGroups(actor, campaign.id, range)).items
            .filter((adSet) => adSet.spend > 0 || adSet.impressions > 0)
            .map((adSet) => ({ campaign, adSet }))
        )
      )
    )
      .flat()
      .sort((a, b) => b.adSet.spend - a.adSet.spend)
      .slice(0, MAX_TREND_AD_SETS)

    type Trend = {
      platform: string
      campaign: string
      ad: string
      state: "running" | "stopped"
      currency: string | null
      spend: number
      days: AdDailyRow[]
    }
    const byAd = new Map<string, Trend>()
    for (const date of dates) {
      const day = { startDate: date, endDate: date }
      const lists = await Promise.all(
        adSets.map(async ({ campaign, adSet }) => ({
          campaign,
          adSet,
          ads: (await this.performance.listAdsOrKeywords(actor, adSet.id, "ads", day)).items,
        }))
      )
      for (const { campaign, adSet, ads } of lists) {
        const parentRunning =
          checkupCampaignState(campaign.status) === "running" &&
          checkupCampaignState(adSet.status) === "running"
        for (const ad of ads) {
          if (!contains(ad.name, input.adName)) continue
          const state =
            parentRunning && checkupCampaignState(ad.status) === "running" ? "running" : "stopped"
          if (input.onlyRunning && state !== "running") continue
          const trend = byAd.get(ad.id) ?? {
            platform: campaign.platform,
            campaign: campaign.name,
            ad: ad.name,
            state,
            currency: campaign.currency,
            spend: 0,
            days: [],
          }
          trend.spend += ad.spend
          trend.days.push({
            date,
            spend: round(ad.spend),
            impressions: ad.impressions,
            clicks: ad.clicks,
            ctrPercent: percent(ad.clicks, ad.impressions),
            results: round(ad.conversions),
            costPerResult: perResult(ad.spend, ad.conversions),
          })
          byAd.set(ad.id, trend)
        }
      }
    }
    const trends = [...byAd.values()]
      .filter((trend) => trend.spend > 0 || trend.days.some((day) => day.impressions > 0))
      .sort((a, b) => b.spend - a.spend)
    return {
      queriedPeriod: { from: dates[0], to: endDate },
      ads: trends.slice(0, MAX_TREND_ADS).map((trend) => ({
        platform: trend.platform,
        campaign: trend.campaign,
        ad: trend.ad,
        state: trend.state,
        currency: trend.currency,
        days: trend.days,
      })),
      omittedAds: Math.max(0, trends.length - MAX_TREND_ADS),
    }
  }

  // The account check-up: each campaign's state and budget, the path from view to result, and
  // what needs attention now, each with the numbers that say so.
  async accountCheckup(
    actor: AuthenticatedActor,
    range: AdsInsightsRange
  ): Promise<{
    queriedPeriod: { from: string; to: string }
    funnel: {
      currency: string | null
      spend: number | null
      impressions: number
      clicks: number
      landingPageViews: number | null
      results: number
      costPerResult: number | null
    }
    campaigns: Array<{
      platform: string
      campaign: string
      // running; problem (switched on but not shown); paused; other.
      state: string
      platformStatus: string
      dailyBudget: number | null
      spendToday: number
      spend: number
      impressions: number
      clicks: number
      landingPageViews: number | null
      results: number
      costPerResult: number | null
      currency: string | null
    }>
    // Only about what is running now. Empty means nothing in the running ads needs attention.
    findings: Array<
      Pick<CheckupFinding, "kind" | "severity" | "platform" | "values" | "currency"> & {
        campaign: string
        ad: string | null
        meaning: string
      }
    >
  }> {
    const result = await this.checkup.run(actor, range)
    return {
      queriedPeriod: { from: result.range.startDate, to: result.range.endDate },
      funnel: {
        currency: result.funnel.currency,
        spend: result.funnel.spend,
        impressions: result.funnel.impressions,
        clicks: result.funnel.clicks,
        landingPageViews: result.funnel.pageViews,
        results: result.funnel.conversions,
        costPerResult: result.funnel.cpa,
      },
      campaigns: result.campaigns
        .filter(
          (campaign) =>
            campaign.spend > 0 || campaign.impressions > 0 || campaign.state !== "paused"
        )
        .slice(0, 25)
        .map((campaign) => ({
          platform: campaign.platform,
          campaign: campaign.name,
          state: campaign.state,
          platformStatus: campaign.status,
          dailyBudget: campaign.dailyBudget,
          spendToday: campaign.spendToday,
          spend: campaign.spend,
          impressions: campaign.impressions,
          clicks: campaign.clicks,
          landingPageViews: campaign.pageViews,
          results: campaign.conversions,
          costPerResult: perResult(campaign.spend, campaign.conversions),
          currency: campaign.currency,
        })),
      findings: result.findings.map((finding) => ({
        kind: finding.kind,
        severity: finding.severity,
        platform: finding.platform,
        campaign: finding.campaignName,
        ad: finding.adName,
        currency: finding.currency,
        values: finding.values,
        meaning: FINDING_MEANING[finding.kind],
      })),
    }
  }
}
