import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import {
  bucketCampaignStatus,
  type CampaignPerformancePlatform,
  type CampaignPerformanceQuery,
  type CampaignPerformanceRow,
  type CampaignsPerformanceAggregationService,
} from "./performance-service"

// The ad account check-up: the same reading a media buyer does by hand, done over the numbers
// Madar already syncs. It answers three things for a merchant who is not a media buyer -- is
// each campaign actually running, where do people drop between seeing the ad and becoming a
// result, and which specific ad or campaign needs attention, with the numbers that say so.
//
// Everything here is plain arithmetic over synced rows. Nothing is guessed: a finding is only
// raised when its evidence is in the data, and each one carries that evidence so the screen can
// show it.

export type CheckupFindingKind =
  // One ad takes most of a campaign's budget while doing worse than the campaign's other ads.
  | "budget_hog"
  // An ad spent well past what a result normally costs here and brought none.
  | "spend_no_result"
  // A campaign gets taps but no results at all.
  | "clicks_no_result"
  // An ad is tapped far less often than the other ads next to it.
  | "low_ctr"
  // Today's spend has reached the daily budget.
  | "budget_reached"
  // A running campaign spent well under its daily budget yesterday (the last full day).
  | "budget_unspent"
  // Switched on but not being shown (in review, rejected, blocked by something above it).
  | "not_delivering"

export type CheckupCampaignState = "running" | "problem" | "paused" | "other"

export interface CheckupFinding {
  kind: CheckupFindingKind
  severity: "high" | "medium"
  platform: CampaignPerformancePlatform
  campaignId: string
  campaignName: string
  adName: string | null
  currency: string | null
  // The numbers behind the finding, keyed by what they are (see each rule below).
  values: Record<string, number | string | null>
}

export interface CheckupCampaign {
  id: string
  platform: CampaignPerformancePlatform
  name: string
  status: string
  state: CheckupCampaignState
  currency: string | null
  dailyBudget: number | null
  spendToday: number
  spend: number
  impressions: number
  clicks: number
  pageViews: number | null
  conversions: number
  cpa: number
}

export interface CheckupAd {
  id: string
  campaignId: string
  campaignName: string
  platform: CampaignPerformancePlatform
  name: string
  status: string
  currency: string | null
  spend: number
  spendShare: number
  impressions: number
  clicks: number
  ctr: number
  pageViews: number | null
  conversions: number
  cpa: number
}

export interface CheckupFunnel {
  // Null when the campaigns in the check-up are billed in more than one currency, so no single
  // money total is honest.
  currency: string | null
  spend: number | null
  impressions: number
  clicks: number
  // Null when no platform in the check-up reports landing page visits.
  pageViews: number | null
  conversions: number
  cpa: number | null
}

export interface CheckupResult {
  range: { startDate: string; endDate: string; days: number }
  funnel: CheckupFunnel
  campaigns: CheckupCampaign[]
  findings: CheckupFinding[]
  ads: CheckupAd[]
}

export interface CheckupInput {
  campaigns: CampaignPerformanceRow[]
  // Campaign id -> what it spent today.
  spendTodayByCampaignId: Map<string, number>
  // Campaign id -> what it spent yesterday, the last full day -- the fair day to hold against
  // the daily budget (a period average would punish a campaign that started mid-period).
  spendYesterdayByCampaignId: Map<string, number>
  // Campaign id -> its ads (any ad set), for the same period as `campaigns`.
  adsByCampaignId: Map<string, CampaignPerformanceRow[]>
  // Campaign id -> daily budget when it sits on the ad sets rather than the campaign.
  adSetBudgetByCampaignId: Map<string, number>
  range: { startDate: string; endDate: string; days: number }
}

// How lopsided, how costly or how weak something must be before it is worth a merchant's
// attention. Deliberately conservative: a check-up that cries wolf stops being read.
const HOG_SHARE = 0.6
const HOG_COST_RATIO = 1.3
const HOG_CTR_RATIO = 0.7
const NO_RESULT_COST_MULTIPLE = 2
const MIN_CLICKS_FOR_NO_RESULT = 100
const MIN_IMPRESSIONS_FOR_CTR = 1000
const LOW_CTR_RATIO = 0.5
const BUDGET_REACHED_RATIO = 0.95
const BUDGET_UNSPENT_RATIO = 0.5
const PAGE_DROP_RATIO = 0.5

const PROBLEM_STATUSES = new Set([
  "under_review",
  "rejected",
  "not_delivering",
  "pending",
  "limited",
])

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0
}

export function checkupCampaignState(status: string): CheckupCampaignState {
  if (PROBLEM_STATUSES.has(status.toLowerCase())) return "problem"
  const bucket = bucketCampaignStatus(status)
  if (bucket === "Active") return "running"
  if (bucket === "Paused") return "paused"
  return "other"
}

function knownPageViews(rows: CampaignPerformanceRow[]): number | null {
  const total = rows.reduce((sum, row) => sum + (row.pageViews ?? 0), 0)
  return total > 0 ? total : null
}

export function buildCheckup(input: CheckupInput): CheckupResult {
  const { range } = input
  const findings: CheckupFinding[] = []

  // What a result normally costs, per currency, across everything in the check-up. This is the
  // yardstick for "this ad spent a lot and brought nothing".
  const totalsByCurrency = new Map<string, { spend: number; conversions: number }>()
  for (const campaign of input.campaigns) {
    const key = campaign.currency ?? ""
    const totals = totalsByCurrency.get(key) ?? { spend: 0, conversions: 0 }
    totals.spend += campaign.spend
    totals.conversions += campaign.conversions
    totalsByCurrency.set(key, totals)
  }

  const campaigns: CheckupCampaign[] = input.campaigns.map((row) => ({
    id: row.id,
    platform: row.platform,
    name: row.name,
    status: row.status,
    state: checkupCampaignState(row.status),
    currency: row.currency,
    dailyBudget: row.dailyBudget ?? input.adSetBudgetByCampaignId.get(row.id) ?? null,
    spendToday: round(input.spendTodayByCampaignId.get(row.id) ?? 0),
    spend: round(row.spend),
    impressions: row.impressions,
    clicks: row.clicks,
    pageViews: row.pageViews && row.pageViews > 0 ? row.pageViews : null,
    conversions: round(row.conversions),
    cpa: row.cpa,
  }))

  const ads: CheckupAd[] = []

  for (const campaign of campaigns) {
    const base = {
      platform: campaign.platform,
      campaignId: campaign.id,
      campaignName: campaign.name,
      currency: campaign.currency,
    }

    if (campaign.state === "problem") {
      findings.push({
        ...base,
        kind: "not_delivering",
        severity: "high",
        adName: null,
        values: { status: campaign.status.toLowerCase() },
      })
    }

    if (campaign.state === "running" && campaign.dailyBudget) {
      if (campaign.spendToday >= campaign.dailyBudget * BUDGET_REACHED_RATIO) {
        findings.push({
          ...base,
          kind: "budget_reached",
          severity: "medium",
          adName: null,
          values: { spendToday: campaign.spendToday, dailyBudget: campaign.dailyBudget },
        })
      } else {
        const spendYesterday = input.spendYesterdayByCampaignId.get(campaign.id) ?? 0
        if (spendYesterday > 0 && spendYesterday < campaign.dailyBudget * BUDGET_UNSPENT_RATIO) {
          findings.push({
            ...base,
            kind: "budget_unspent",
            severity: "medium",
            adName: null,
            values: { spendYesterday: round(spendYesterday), dailyBudget: campaign.dailyBudget },
          })
        }
      }
    }

    if (campaign.conversions === 0 && campaign.clicks >= MIN_CLICKS_FOR_NO_RESULT) {
      // Where the people who tapped were lost: before the page opened, or on the page itself.
      const reason =
        campaign.pageViews === null
          ? "unknown"
          : campaign.pageViews < campaign.clicks * PAGE_DROP_RATIO
            ? "page_drop"
            : "no_signup"
      findings.push({
        ...base,
        kind: "clicks_no_result",
        severity: "high",
        adName: null,
        values: {
          clicks: campaign.clicks,
          spend: campaign.spend,
          pageViews: campaign.pageViews,
          reason,
        },
      })
    }

    const campaignAds = (input.adsByCampaignId.get(campaign.id) ?? []).filter(
      (ad) => ad.spend > 0 || ad.impressions > 0
    )
    const adSpend = campaignAds.reduce((sum, ad) => sum + ad.spend, 0)
    const flagged = new Set<string>()

    for (const ad of campaignAds) {
      ads.push({
        id: ad.id,
        campaignId: campaign.id,
        campaignName: campaign.name,
        platform: campaign.platform,
        name: ad.name,
        status: ad.status,
        currency: campaign.currency,
        spend: round(ad.spend),
        spendShare: round(ratio(ad.spend, adSpend) * 100, 1),
        impressions: ad.impressions,
        clicks: ad.clicks,
        ctr: ad.ctr,
        pageViews: ad.pageViews && ad.pageViews > 0 ? ad.pageViews : null,
        conversions: round(ad.conversions),
        cpa: ad.cpa,
      })
    }

    // -- One ad eating the budget while the others do better -----------------------------
    if (campaignAds.length >= 2 && adSpend > 0) {
      for (const ad of campaignAds) {
        const share = ad.spend / adSpend
        if (share < HOG_SHARE) continue
        const others = campaignAds.filter((other) => other.id !== ad.id)
        const othersSpend = others.reduce((sum, other) => sum + other.spend, 0)
        const othersConversions = others.reduce((sum, other) => sum + other.conversions, 0)
        const othersClicks = others.reduce((sum, other) => sum + other.clicks, 0)
        const othersImpressions = others.reduce((sum, other) => sum + other.impressions, 0)
        const othersCpa = ratio(othersSpend, othersConversions)
        const othersCtr = ratio(othersClicks, othersImpressions) * 100

        let basis: "cost" | "no_result" | "ctr" | null = null
        if (othersConversions > 0) {
          if (ad.conversions === 0) basis = "no_result"
          else if (ad.cpa > othersCpa * HOG_COST_RATIO) basis = "cost"
        } else if (
          ad.conversions === 0 &&
          othersImpressions >= MIN_IMPRESSIONS_FOR_CTR / 2 &&
          ad.ctr < othersCtr * HOG_CTR_RATIO
        ) {
          basis = "ctr"
        }
        if (!basis) continue

        flagged.add(ad.id)
        findings.push({
          ...base,
          kind: "budget_hog",
          severity: "high",
          adName: ad.name,
          values: {
            basis,
            share: round(share * 100, 0),
            spend: round(ad.spend),
            adCpa: ad.cpa,
            othersCpa: round(othersCpa),
            adCtr: ad.ctr,
            othersCtr: round(othersCtr),
          },
        })
      }
    }

    // -- An ad that spent well past the usual cost of a result and brought none -----------
    const totals = totalsByCurrency.get(campaign.currency ?? "")
    const usualCpa = totals && totals.conversions > 0 ? totals.spend / totals.conversions : 0
    if (usualCpa > 0) {
      for (const ad of campaignAds) {
        if (flagged.has(ad.id) || ad.conversions > 0) continue
        if (ad.spend < usualCpa * NO_RESULT_COST_MULTIPLE) continue
        flagged.add(ad.id)
        findings.push({
          ...base,
          kind: "spend_no_result",
          severity: "high",
          adName: ad.name,
          values: { spend: round(ad.spend), usualCpa: round(usualCpa) },
        })
      }
    }

    // -- An ad tapped far less often than its neighbours -----------------------------------
    const measured = campaignAds.filter((ad) => ad.impressions >= MIN_IMPRESSIONS_FOR_CTR)
    if (measured.length >= 2) {
      for (const ad of measured) {
        if (flagged.has(ad.id)) continue
        const others = measured.filter((other) => other.id !== ad.id)
        const othersCtr =
          ratio(
            others.reduce((sum, other) => sum + other.clicks, 0),
            others.reduce((sum, other) => sum + other.impressions, 0)
          ) * 100
        if (othersCtr <= 0 || ad.ctr >= othersCtr * LOW_CTR_RATIO) continue
        findings.push({
          ...base,
          kind: "low_ctr",
          severity: "medium",
          adName: ad.name,
          values: { adCtr: ad.ctr, othersCtr: round(othersCtr), impressions: ad.impressions },
        })
      }
    }
  }

  const spendOf = (finding: CheckupFinding) =>
    typeof finding.values.spend === "number" ? finding.values.spend : 0
  findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1
    return spendOf(b) - spendOf(a)
  })

  const withActivity = input.campaigns.filter((row) => row.spend > 0 || row.impressions > 0)
  const currencies = new Set(withActivity.filter((row) => row.spend > 0).map((row) => row.currency))
  const singleCurrency = currencies.size <= 1
  const spend = withActivity.reduce((sum, row) => sum + row.spend, 0)
  const conversions = withActivity.reduce((sum, row) => sum + row.conversions, 0)

  return {
    range,
    funnel: {
      currency: singleCurrency ? ([...currencies][0] ?? null) : null,
      spend: singleCurrency ? round(spend) : null,
      impressions: withActivity.reduce((sum, row) => sum + row.impressions, 0),
      clicks: withActivity.reduce((sum, row) => sum + row.clicks, 0),
      pageViews: knownPageViews(withActivity),
      conversions: round(conversions),
      cpa: singleCurrency && conversions > 0 ? round(spend / conversions) : null,
    },
    campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    findings,
    ads: ads.sort((a, b) => b.spend - a.spend),
  }
}

// How many campaigns get the ad-level reading. The check-up reads ads one campaign at a time,
// so this keeps one run bounded on accounts with a long history of old campaigns.
const MAX_CAMPAIGNS_WITH_ADS = 12

// "Today" as a merchant in Saudi Arabia means it, not the server's UTC day.
function riyadhToday(now: Date): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export class CampaignCheckupService {
  constructor(
    private readonly performance: CampaignsPerformanceAggregationService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async run(actor: AuthenticatedActor, query: CampaignPerformanceQuery): Promise<CheckupResult> {
    const today = riyadhToday(this.now())
    const endDate = query.endDate ?? today
    const startDate =
      query.startDate ??
      new Date(new Date(endDate).getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const days = Math.max(
      1,
      Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1
    )
    const ranged = { ...query, startDate, endDate }

    const yesterday = riyadhToday(new Date(this.now().getTime() - 86_400_000))
    const oneDay = (day: string) =>
      this.performance.listAllCampaignRows(actor, { ...query, startDate: day, endDate: day })
    const [campaigns, todayRows, yesterdayRows] = await Promise.all([
      this.performance.listAllCampaignRows(actor, ranged),
      oneDay(today),
      oneDay(yesterday),
    ])

    const worthReading = campaigns
      .filter((row) => row.spend > 0 || checkupCampaignState(row.status) !== "paused")
      .sort((a, b) => b.spend - a.spend)
      .slice(0, MAX_CAMPAIGNS_WITH_ADS)

    const adsByCampaignId = new Map<string, CampaignPerformanceRow[]>()
    const adSetBudgetByCampaignId = new Map<string, number>()
    await Promise.all(
      worthReading.map(async (campaign) => {
        const adSets = (await this.performance.listAdGroups(actor, campaign.id, ranged)).items
        const budget = adSets
          .filter((adSet) => checkupCampaignState(adSet.status) !== "paused")
          .reduce((sum, adSet) => sum + (adSet.dailyBudget ?? 0), 0)
        if (budget > 0) adSetBudgetByCampaignId.set(campaign.id, budget)

        const adLists = await Promise.all(
          adSets
            .filter((adSet) => adSet.spend > 0 || adSet.impressions > 0)
            .map((adSet) => this.performance.listAdsOrKeywords(actor, adSet.id, "ads", ranged))
        )
        adsByCampaignId.set(
          campaign.id,
          adLists.flatMap((list) => list.items)
        )
      })
    )

    return buildCheckup({
      campaigns,
      spendTodayByCampaignId: new Map(todayRows.map((row) => [row.id, row.spend])),
      spendYesterdayByCampaignId: new Map(yesterdayRows.map((row) => [row.id, row.spend])),
      adsByCampaignId,
      adSetBudgetByCampaignId,
      range: { startDate, endDate, days },
    })
  }
}
