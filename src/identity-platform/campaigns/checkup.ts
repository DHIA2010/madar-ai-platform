import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import {
  type AdChange,
  type AdChangeField,
  type AdChangeTracker,
  type AdEntityLevel,
  SIGNIFICANT_FIELDS,
} from "./ad-changes"
import type { AdHistory, DailyPoint } from "./ad-history"
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
//
// A finding is something to act on now, so it is only ever raised about what is running now: a
// campaign that is switched on, and inside it an ad that is switched on in an ad set that is
// switched on. An ad or campaign someone already stopped still shows in the tables with its
// numbers, and still counts as the yardstick the running ads are held against, but "pause this
// ad" is never said about an ad that is already paused.

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
  // -- How the account is being managed (from Madar's own change log, see ad-changes.ts) ------
  // An ad set was changed (budget, bid, audience, goal) while it was still learning.
  | "edit_in_learning"
  // The same ad set or campaign was changed again and again within a week.
  | "too_many_edits"
  // A budget was raised or cut by more than 30% in one go.
  | "big_budget_jump"
  // The bid was changed twice or more within three days.
  | "bid_churn"
  // Switched off and on again and again within a week.
  | "on_off_flapping"
  // -- Where each running ad stands (its stage, see adStage below) ---------------------------
  // Too early to judge: it has not spent enough, or run long enough, yet.
  | "ad_wait"
  // Still early, but already tapped more (or bringing results cheaper) than its neighbours.
  | "ad_promising"
  // Enough spend, and its results cost clearly less than the campaign's other ads.
  | "ad_winning"
  // It used to do well and is now tapped less, or its results cost more: the creative is tired.
  | "ad_tired"
  // Enough spend, and its results cost far more than the campaign's other ads.
  | "ad_costly"

export type CheckupCampaignState = "running" | "problem" | "paused" | "other"

// high / medium: act on it. info: worth knowing (be patient). good: going well.
export type CheckupSeverity = "high" | "medium" | "info" | "good"

// Where a running ad stands: too early to judge, already looking good, clearly better than its
// neighbours, doing as expected, worn out, or clearly not working.
export type CheckupAdStage =
  | "too_early"
  | "promising"
  | "winning"
  | "steady"
  | "tired"
  | "not_working"

// The rates an ad is held against. Null where the number means nothing (no clicks, no results).
export interface CheckupAverages {
  ctr: number | null
  cpc: number | null
  cpm: number | null
  cpa: number | null
  // Of those who tapped, the share who became a result, in percent.
  cvr: number | null
}

// One window of days around a change: what the entity did before it, and after it.
export interface CheckupEffectWindow {
  days: number
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number | null
  cpa: number | null
}

export interface CheckupChange {
  id: string
  // The campaign or ad set that was changed.
  rowId: string
  platform: CampaignPerformancePlatform
  campaignId: string
  campaignName: string
  currency: string | null
  level: AdEntityLevel
  name: string
  field: AdChangeField
  oldValue: string | null
  newValue: string | null
  // How much a budget or bid moved, in percent; null for settings that are not amounts.
  changePercent: number | null
  duringLearning: boolean | null
  learningSource: "platform" | "estimate" | null
  changedAt: string
  // The 3 days before the change against the (up to) 3 full days after it; null until at least
  // one full day has passed, or where the platform keeps no daily numbers.
  effect: { before: CheckupEffectWindow; after: CheckupEffectWindow } | null
}

export interface CheckupFinding {
  kind: CheckupFindingKind
  severity: CheckupSeverity
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
  // Switched on, in an ad set and a campaign that are switched on. Only such an ad gets findings.
  running: boolean
  currency: string | null
  spend: number
  spendShare: number
  impressions: number
  clicks: number
  ctr: number
  pageViews: number | null
  conversions: number
  cpa: number
  cpc: number | null
  cpm: number | null
  cvr: number | null
  // Where it stands (running ads only; null for an ad that is switched off).
  stage: CheckupAdStage | null
  // Where the problem most likely is: page = tapped as much as the others but nobody finishes
  // (the landing page or the offer), creative = tapped far less than the others.
  diagnosis: "page" | "creative" | null
  // Days since it was created (or first shown), when known.
  ageDays: number | null
  // Still to spend, and days still to run, before it can be judged (too early / promising only).
  spendToJudge: number | null
  daysToJudge: number | null
  // The campaign's other ads together, and every ad in the account in the same currency.
  campaignAverage: CheckupAverages | null
  accountAverage: CheckupAverages | null
  // Its earlier days against its last 3 days (ads with a week or more of daily numbers).
  trend: {
    earlyCtr: number
    recentCtr: number
    earlyCpa: number | null
    recentCpa: number | null
  } | null
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
  // What was changed in the period, newest first.
  changes: CheckupChange[]
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
  // The ad sets that are switched off: their ads are not running, whatever the ads' own state.
  stoppedAdSetIds?: Set<string>
  range: { startDate: string; endDate: string; days: number }
  // Day-by-day numbers by row id (ads, and the campaigns and ad sets that were changed).
  history?: Map<string, DailyPoint[]>
  // Ad row id -> when it was created on its platform (ISO).
  adCreatedAt?: Map<string, string>
  // What was changed in the period (Madar's own change log).
  changes?: AdChange[]
  // The moment of the check-up; "today" is read in Riyadh time from it.
  now?: Date
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

// When an ad can be judged: it spent twice what a result normally costs here (or, with no
// results anywhere to go by, was shown 3,000 times) and ran 3 days -- or brought 5 results.
const JUDGE_SPEND_MULTIPLE = 2
const JUDGE_MIN_DAYS = 3
const JUDGE_MIN_IMPRESSIONS = 3000
const JUDGE_MIN_RESULTS = 5
// The campaign yardstick only counts once the campaign has this many results.
const YARDSTICK_MIN_RESULTS = 3
const PROMISING_CTR_RATIO = 1.2
const WINNING_CPA_RATIO = 0.9
const COSTLY_CPA_RATIO = 1.5
const WEAK_CTR_RATIO = 0.5
const CREATIVE_CTR_RATIO = 0.7
const PAGE_MIN_CLICKS = 30
// Tired: a week or more of days, and the last 3 tapped at most 70% as often as the days before
// (or its results costing half again as much).
const TIRED_MIN_DAYS = 7
const TIRED_RECENT_DAYS = 3
const TIRED_CTR_RATIO = 0.7
const TIRED_CPA_RATIO = 1.5
const TIRED_MIN_EARLY_IMPRESSIONS = 2000
const TIRED_MIN_RECENT_IMPRESSIONS = 300

// How the account is managed: what counts as too much.
const WEEK_MS = 7 * 86_400_000
const BID_WINDOW_MS = 3 * 86_400_000
const MANY_EDITS = 3
const VERY_MANY_EDITS = 5
const BID_EDITS = 2
const ON_OFF_SWITCHES = 3
const BUDGET_JUMP_PERCENT = 30
const EFFECT_DAYS = 3

const SEVERITY_ORDER: Record<CheckupSeverity, number> = { high: 0, medium: 1, info: 2, good: 3 }

const PLATFORM_OF_PREFIX: Record<string, CampaignPerformancePlatform> = {
  snapchat_ads: "Snapchat",
  tiktok_ads: "TikTok",
  meta_ads: "Meta",
  google_ads: "Google Search",
}

const DAY_MS = 86_400_000
const addDays = (day: string, days: number) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)
const riyadhDayOf = (instant: Date) =>
  new Date(instant.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

interface Totals {
  spend: number
  impressions: number
  clicks: number
  conversions: number
}

function sum(rows: Totals[]): Totals {
  return rows.reduce(
    (total, row) => ({
      spend: total.spend + row.spend,
      impressions: total.impressions + row.impressions,
      clicks: total.clicks + row.clicks,
      conversions: total.conversions + row.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  )
}

export function averagesOf(rows: Totals[]): CheckupAverages | null {
  const total = sum(rows)
  if (total.impressions <= 0 && total.spend <= 0) return null
  return {
    ctr: total.impressions > 0 ? round((total.clicks / total.impressions) * 100) : null,
    cpc: total.clicks > 0 ? round(total.spend / total.clicks) : null,
    cpm: total.impressions > 0 ? round((total.spend / total.impressions) * 1000) : null,
    cpa: total.conversions > 0 ? round(total.spend / total.conversions) : null,
    cvr: total.clicks > 0 ? round((total.conversions / total.clicks) * 100) : null,
  }
}

function windowOf(points: DailyPoint[]): CheckupEffectWindow {
  const total = sum(points)
  return {
    days: points.length,
    spend: round(total.spend),
    impressions: total.impressions,
    clicks: total.clicks,
    conversions: round(total.conversions),
    ctr: total.impressions > 0 ? round((total.clicks / total.impressions) * 100) : null,
    cpa: total.conversions > 0 ? round(total.spend / total.conversions) : null,
  }
}

// The most changes that fall inside any one window of `windowMs`.
function mostInWindow(times: number[], windowMs: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  let best = 0
  let start = 0
  for (let end = 0; end < sorted.length; end += 1) {
    while (sorted[end] - sorted[start] > windowMs) start += 1
    best = Math.max(best, end - start + 1)
  }
  return best
}

// Changes saved in one pass share a moment: count edits by moment, not by setting.
const moments = (changes: Array<{ changedAt: string }>) =>
  [
    ...new Set(changes.map((change) => Math.floor(new Date(change.changedAt).getTime() / 60_000))),
  ].map((minute) => minute * 60_000)

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

interface AdStageInput {
  ad: CampaignPerformanceRow
  // The campaign's other ads (stopped ones included: they are the yardstick too).
  others: CampaignPerformanceRow[]
  // What a result costs here: the campaign's own cost once it has a few results, else the
  // account's. Null when nothing anywhere brought a result.
  yardstick: number | null
  // The account's usual cost of a result in this currency (0 = none).
  usualCpa: number
  ageDays: number | null
  history: DailyPoint[]
  today: string
}

export interface AdStageReading {
  stage: CheckupAdStage
  diagnosis: "page" | "creative" | null
  spendToJudge: number | null
  daysToJudge: number | null
  othersCtr: number | null
  othersCpa: number | null
  trend: CheckupAd["trend"]
}

// Where one running ad stands. Patience first: an ad is only called good or bad once it spent
// enough and ran long enough for its numbers to mean something.
export function adStage(input: AdStageInput): AdStageReading {
  const { ad, yardstick } = input
  const othersAverage = averagesOf(input.others.filter((other) => other.impressions > 0))
  const othersCtr = othersAverage?.ctr ?? null
  const othersCpa = othersAverage?.cpa ?? (input.usualCpa > 0 ? round(input.usualCpa) : null)

  const oldEnough = input.ageDays === null || input.ageDays >= JUDGE_MIN_DAYS
  const spentEnough = yardstick
    ? ad.spend >= yardstick * JUDGE_SPEND_MULTIPLE
    : ad.impressions >= JUDGE_MIN_IMPRESSIONS
  const judged = oldEnough && (spentEnough || ad.conversions >= JUDGE_MIN_RESULTS)

  const tappedLess =
    othersCtr !== null && ad.impressions >= MIN_IMPRESSIONS_FOR_CTR && ad.ctr < othersCtr
  const diagnosis: AdStageReading["diagnosis"] =
    judged &&
    ad.clicks >= PAGE_MIN_CLICKS &&
    ad.conversions === 0 &&
    (othersCtr === null || ad.ctr >= othersCtr * 0.9)
      ? "page"
      : tappedLess && othersCtr !== null && ad.ctr < othersCtr * CREATIVE_CTR_RATIO
        ? "creative"
        : null

  if (!judged) {
    const promising =
      (othersCtr !== null &&
        ad.impressions >= MIN_IMPRESSIONS_FOR_CTR &&
        ad.ctr >= othersCtr * PROMISING_CTR_RATIO) ||
      (ad.conversions > 0 && othersCpa !== null && ad.cpa <= othersCpa)
    return {
      stage: promising ? "promising" : "too_early",
      diagnosis: null,
      spendToJudge: yardstick
        ? round(Math.max(0, yardstick * JUDGE_SPEND_MULTIPLE - ad.spend))
        : null,
      daysToJudge:
        input.ageDays === null ? null : Math.max(0, Math.ceil(JUDGE_MIN_DAYS - input.ageDays)),
      othersCtr,
      othersCpa,
      trend: null,
    }
  }

  // Its earlier days against its last few full days.
  const days = input.history.filter((point) => point.day < input.today && point.impressions > 0)
  let trend: CheckupAd["trend"] = null
  let tired = false
  if (days.length >= TIRED_MIN_DAYS) {
    const early = sum(days.slice(0, -TIRED_RECENT_DAYS))
    const recent = sum(days.slice(-TIRED_RECENT_DAYS))
    if (
      early.impressions >= TIRED_MIN_EARLY_IMPRESSIONS &&
      recent.impressions >= TIRED_MIN_RECENT_IMPRESSIONS
    ) {
      const earlyCtr = (early.clicks / early.impressions) * 100
      const recentCtr = (recent.clicks / recent.impressions) * 100
      const earlyCpa = early.conversions > 0 ? early.spend / early.conversions : null
      const recentCpa = recent.conversions > 0 ? recent.spend / recent.conversions : null
      trend = {
        earlyCtr: round(earlyCtr),
        recentCtr: round(recentCtr),
        earlyCpa: earlyCpa === null ? null : round(earlyCpa),
        recentCpa: recentCpa === null ? null : round(recentCpa),
      }
      // It only tires if it was doing well to begin with.
      const wasGood = early.conversions > 0 || othersCtr === null || earlyCtr >= othersCtr
      const tapsFell = earlyCtr > 0 && recentCtr <= earlyCtr * TIRED_CTR_RATIO
      const costRose =
        earlyCpa !== null &&
        early.conversions >= YARDSTICK_MIN_RESULTS &&
        (recentCpa === null
          ? recent.spend >= earlyCpa * JUDGE_SPEND_MULTIPLE
          : recentCpa >= earlyCpa * TIRED_CPA_RATIO)
      tired = (wasGood && tapsFell) || costRose
    }
  }

  let stage: CheckupAdStage = "steady"
  if (tired) stage = "tired"
  else if (ad.conversions > 0 && othersCpa !== null && ad.cpa <= othersCpa * WINNING_CPA_RATIO)
    stage = "winning"
  else if (
    (ad.conversions === 0 && yardstick !== null && spentEnough) ||
    (ad.conversions > 0 && othersCpa !== null && ad.cpa >= othersCpa * COSTLY_CPA_RATIO) ||
    (yardstick === null &&
      othersCtr !== null &&
      ad.impressions >= MIN_IMPRESSIONS_FOR_CTR &&
      ad.ctr < othersCtr * WEAK_CTR_RATIO)
  )
    stage = "not_working"

  return { stage, diagnosis, spendToJudge: null, daysToJudge: null, othersCtr, othersCpa, trend }
}

// How the account is being managed, read off the change log: one finding per habit per
// campaign or ad set.
export function managementFindings(
  changes: CheckupChange[],
  campaignsById: Map<
    string,
    { name: string; platform: CampaignPerformancePlatform; currency: string | null }
  >
): CheckupFinding[] {
  const findings: CheckupFinding[] = []
  const byEntity = new Map<string, CheckupChange[]>()
  for (const change of changes) {
    const list = byEntity.get(change.rowId) ?? []
    list.push(change)
    byEntity.set(change.rowId, list)
  }
  for (const list of byEntity.values()) {
    const first = list[0]
    const campaign = campaignsById.get(first.campaignId)
    const base = {
      platform: campaign?.platform ?? first.platform,
      campaignId: first.campaignId,
      campaignName: campaign?.name ?? first.campaignName,
      adName: first.level === "adset" ? first.name : null,
      currency: campaign?.currency ?? first.currency,
    }
    const level = first.level
    const significant = list.filter((change) => SIGNIFICANT_FIELDS.has(change.field))

    const inLearning = significant.filter((change) => change.duringLearning === true)
    if (inLearning.length > 0) {
      const fields = [...new Set(inLearning.map((change) => change.field))]
      findings.push({
        ...base,
        kind: "edit_in_learning",
        severity: "high",
        values: {
          level,
          edits: moments(inLearning).length,
          fields: fields.join(","),
          lastAt:
            inLearning
              .map((change) => change.changedAt)
              .sort()
              .at(-1) ?? null,
          source: inLearning.some((change) => change.learningSource === "platform")
            ? "platform"
            : "estimate",
        },
      })
    } else {
      const edits = mostInWindow(moments(significant), WEEK_MS)
      if (edits >= MANY_EDITS) {
        findings.push({
          ...base,
          kind: "too_many_edits",
          severity: edits >= VERY_MANY_EDITS ? "high" : "medium",
          values: { level, edits, days: 7 },
        })
      }
    }

    const jumps = list.filter(
      (change) =>
        (change.field === "dailyBudget" || change.field === "lifetimeBudget") &&
        change.changePercent !== null &&
        Math.abs(change.changePercent) > BUDGET_JUMP_PERCENT
    )
    if (jumps.length > 0) {
      const biggest = [...jumps].sort(
        (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0)
      )[0]
      findings.push({
        ...base,
        kind: "big_budget_jump",
        severity: "medium",
        values: {
          level,
          oldValue: Number(biggest.oldValue),
          newValue: Number(biggest.newValue),
          percent: biggest.changePercent,
          jumps: jumps.length,
        },
      })
    }

    const bids = list.filter((change) => change.field === "bid" || change.field === "bidStrategy")
    const bidEdits = mostInWindow(moments(bids), BID_WINDOW_MS)
    if (bidEdits >= BID_EDITS) {
      findings.push({
        ...base,
        kind: "bid_churn",
        severity: "medium",
        values: { level, edits: bidEdits, days: 3 },
      })
    }

    const switches = mostInWindow(
      moments(list.filter((change) => change.field === "status")),
      WEEK_MS
    )
    if (switches >= ON_OFF_SWITCHES) {
      findings.push({
        ...base,
        kind: "on_off_flapping",
        severity: "medium",
        values: { level, switches, days: 7 },
      })
    }
  }
  return findings
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

  const now = input.now ?? new Date()
  const today = riyadhDayOf(now)
  const history = input.history ?? new Map<string, DailyPoint[]>()

  // Every ad in the account, per currency: the widest yardstick an ad is held against.
  const accountAverageByCurrency = new Map<string, CheckupAverages | null>()
  {
    const byCurrency = new Map<string, CampaignPerformanceRow[]>()
    for (const campaign of campaigns) {
      const key = campaign.currency ?? ""
      const list = byCurrency.get(key) ?? []
      list.push(...(input.adsByCampaignId.get(campaign.id) ?? []))
      byCurrency.set(key, list)
    }
    for (const [key, list] of byCurrency) accountAverageByCurrency.set(key, averagesOf(list))
  }

  // How old an ad is: from when it was created, else from its first day with numbers.
  const ageOf = (adId: string): number | null => {
    const created = input.adCreatedAt?.get(adId)
    if (created) return round((now.getTime() - new Date(created).getTime()) / DAY_MS, 1)
    const firstDay = history.get(adId)?.[0]?.day
    if (firstDay) {
      return round((now.getTime() - new Date(`${firstDay}T00:00:00+03:00`).getTime()) / DAY_MS, 1)
    }
    return null
  }

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

    const campaignRunning = campaign.state === "running"
    if (
      campaignRunning &&
      campaign.conversions === 0 &&
      campaign.clicks >= MIN_CLICKS_FOR_NO_RESULT
    ) {
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
    const isRunning = (ad: CampaignPerformanceRow) =>
      campaignRunning &&
      checkupCampaignState(ad.status) === "running" &&
      !(ad.parentId && input.stoppedAdSetIds?.has(ad.parentId))
    // The ads that share the budget today: the only ones money can move between.
    const runningAds = campaignAds.filter(isRunning)
    const runningSpend = runningAds.reduce((sum, ad) => sum + ad.spend, 0)

    // What a result normally costs in this currency across the account, and in this campaign
    // once it has a few results of its own.
    const totals = totalsByCurrency.get(campaign.currency ?? "")
    const usualCpa = totals && totals.conversions > 0 ? totals.spend / totals.conversions : 0
    const campaignTotals = sum(campaignAds)
    const yardstick =
      campaignTotals.conversions >= YARDSTICK_MIN_RESULTS
        ? campaignTotals.spend / campaignTotals.conversions
        : usualCpa > 0
          ? usualCpa
          : null

    // Where each running ad stands, before anything is said about it: an ad too new to judge
    // is not called weak.
    const readings = new Map<string, AdStageReading>()
    for (const ad of runningAds) {
      readings.set(
        ad.id,
        adStage({
          ad,
          others: campaignAds.filter((other) => other.id !== ad.id),
          yardstick,
          usualCpa,
          ageDays: ageOf(ad.id),
          history: history.get(ad.id) ?? [],
          today,
        })
      )
    }
    const tooEarly = (ad: CampaignPerformanceRow) => {
      const stage = readings.get(ad.id)?.stage
      return stage === "too_early" || stage === "promising"
    }

    const entries = new Map<string, CheckupAd>()
    for (const ad of campaignAds) {
      const reading = readings.get(ad.id) ?? null
      const entry: CheckupAd = {
        id: ad.id,
        campaignId: campaign.id,
        campaignName: campaign.name,
        platform: campaign.platform,
        name: ad.name,
        status: ad.status,
        running: isRunning(ad),
        currency: campaign.currency,
        spend: round(ad.spend),
        spendShare: round(ratio(ad.spend, adSpend) * 100, 1),
        impressions: ad.impressions,
        clicks: ad.clicks,
        ctr: ad.ctr,
        pageViews: ad.pageViews && ad.pageViews > 0 ? ad.pageViews : null,
        conversions: round(ad.conversions),
        cpa: ad.cpa,
        cpc: ad.clicks > 0 ? round(ad.spend / ad.clicks) : null,
        cpm: ad.impressions > 0 ? round((ad.spend / ad.impressions) * 1000) : null,
        cvr: ad.clicks > 0 ? round((ad.conversions / ad.clicks) * 100) : null,
        stage: reading?.stage ?? null,
        diagnosis: reading?.diagnosis ?? null,
        ageDays: ageOf(ad.id),
        spendToJudge: reading?.spendToJudge ?? null,
        daysToJudge: reading?.daysToJudge ?? null,
        campaignAverage: averagesOf(campaignAds.filter((other) => other.id !== ad.id)),
        accountAverage: accountAverageByCurrency.get(campaign.currency ?? "") ?? null,
        trend: reading?.trend ?? null,
      }
      entries.set(ad.id, entry)
      ads.push(entry)
    }

    // -- One ad eating the budget while the others do better -----------------------------
    if (runningAds.length >= 2 && runningSpend > 0) {
      for (const ad of runningAds) {
        const share = ad.spend / runningSpend
        if (share < HOG_SHARE) continue
        const others = runningAds.filter((other) => other.id !== ad.id)
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
        // Its neighbours already did better with less money: that is enough to call it.
        const entry = entries.get(ad.id)
        if (entry) entry.stage = "not_working"
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
    if (usualCpa > 0) {
      for (const ad of runningAds) {
        if (flagged.has(ad.id) || ad.conversions > 0 || tooEarly(ad)) continue
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
        // A running ad is held against every other ad of the campaign, stopped ones included.
        if (flagged.has(ad.id) || !isRunning(ad) || tooEarly(ad)) continue
        const others = measured.filter((other) => other.id !== ad.id)
        const othersCtr =
          ratio(
            others.reduce((sum, other) => sum + other.clicks, 0),
            others.reduce((sum, other) => sum + other.impressions, 0)
          ) * 100
        if (othersCtr <= 0 || ad.ctr >= othersCtr * LOW_CTR_RATIO) continue
        flagged.add(ad.id)
        findings.push({
          ...base,
          kind: "low_ctr",
          severity: "medium",
          adName: ad.name,
          values: { adCtr: ad.ctr, othersCtr: round(othersCtr), impressions: ad.impressions },
        })
      }
    }

    // -- Where each running ad stands, as a note -----------------------------------------
    for (const ad of runningAds) {
      const entry = entries.get(ad.id)
      const reading = readings.get(ad.id)
      if (!entry || !reading || entry.stage === null) continue
      const shared = {
        ...base,
        adName: ad.name,
        values: {
          spend: round(ad.spend),
          adCtr: ad.ctr,
          othersCtr: reading.othersCtr,
          adCpa: ad.conversions > 0 ? round(ad.cpa) : null,
          othersCpa: reading.othersCpa,
          conversions: round(ad.conversions),
          ageDays: entry.ageDays,
          spendToJudge: reading.spendToJudge,
          daysToJudge: reading.daysToJudge,
          diagnosis: reading.diagnosis,
          earlyCtr: reading.trend?.earlyCtr ?? null,
          recentCtr: reading.trend?.recentCtr ?? null,
          earlyCpa: reading.trend?.earlyCpa ?? null,
          recentCpa: reading.trend?.recentCpa ?? null,
        },
      }
      if (entry.stage === "too_early") {
        findings.push({ ...shared, kind: "ad_wait", severity: "info" })
      } else if (entry.stage === "promising") {
        findings.push({ ...shared, kind: "ad_promising", severity: "good" })
      } else if (entry.stage === "winning") {
        findings.push({ ...shared, kind: "ad_winning", severity: "good" })
      } else if (entry.stage === "tired") {
        findings.push({ ...shared, kind: "ad_tired", severity: "medium" })
      } else if (entry.stage === "not_working" && !flagged.has(ad.id)) {
        findings.push({ ...shared, kind: "ad_costly", severity: "medium" })
      }
    }
  }

  // -- What was changed, and what it did -------------------------------------------------
  const campaignsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  const changes: CheckupChange[] = (input.changes ?? []).map((change) => {
    const campaign = campaignsById.get(change.campaignRowId)
    const oldAmount = Number(change.oldValue)
    const newAmount = Number(change.newValue)
    const amount =
      change.field === "dailyBudget" || change.field === "lifetimeBudget" || change.field === "bid"
    const changePercent =
      amount && Number.isFinite(oldAmount) && Number.isFinite(newAmount) && oldAmount > 0
        ? round(((newAmount - oldAmount) / oldAmount) * 100, 0)
        : null
    // The 3 days before the day of the change against the full days after it (up to 3).
    const changeDay = riyadhDayOf(new Date(change.changedAt))
    const points = history.get(change.rowId) ?? []
    const before = points.filter(
      (point) => point.day >= addDays(changeDay, -EFFECT_DAYS) && point.day < changeDay
    )
    const after = points.filter(
      (point) =>
        point.day > changeDay && point.day <= addDays(changeDay, EFFECT_DAYS) && point.day < today
    )
    return {
      id: change.id,
      rowId: change.rowId,
      platform: campaign?.platform ?? PLATFORM_OF_PREFIX[change.rowId.split(":")[0]] ?? "Snapchat",
      campaignId: change.campaignRowId,
      campaignName: campaign?.name ?? (change.level === "campaign" ? change.name : ""),
      currency: campaign?.currency ?? null,
      level: change.level,
      name: change.name,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      changePercent,
      duringLearning: change.duringLearning,
      learningSource: change.learningSource,
      changedAt: change.changedAt,
      effect:
        before.length > 0 && after.length > 0
          ? { before: windowOf(before), after: windowOf(after) }
          : null,
    }
  })
  findings.push(...managementFindings(changes, campaignsById))

  const spendOf = (finding: CheckupFinding) =>
    typeof finding.values.spend === "number" ? finding.values.spend : 0
  findings.sort((a, b) => {
    if (a.severity !== b.severity) return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
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
    changes: changes.sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
  }
}

// How many campaigns get the ad-level reading. The check-up reads ads one campaign at a time,
// so this keeps one run bounded on accounts with a long history of old campaigns.
const MAX_CAMPAIGNS_WITH_ADS = 12

// "Today" as a merchant in Saudi Arabia means it, not the server's UTC day.
function riyadhToday(now: Date): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Where the check-up reads the change log and the daily numbers from (set once at startup).
export interface CheckupSources {
  tracker: AdChangeTracker
  history: AdHistory
}
let registeredSources: CheckupSources | null = null
export const registerCheckupSources = (sources: CheckupSources | null) => {
  registeredSources = sources
}

export class CampaignCheckupService {
  constructor(
    private readonly performance: CampaignsPerformanceAggregationService,
    private readonly now: () => Date = () => new Date(),
    private readonly sources: CheckupSources | null = null
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
    const stoppedAdSetIds = new Set<string>()
    await Promise.all(
      worthReading.map(async (campaign) => {
        const adSets = (await this.performance.listAdGroups(actor, campaign.id, ranged)).items
        for (const adSet of adSets) {
          if (checkupCampaignState(adSet.status) !== "running") stoppedAdSetIds.add(adSet.id)
        }
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

    // The change log (brought up to date first) and the day-by-day numbers. A failure here
    // only leaves the stages and the change notes out -- the rest of the check-up still runs.
    const sources = this.sources ?? registeredSources
    let changes: AdChange[] = []
    let history = new Map<string, DailyPoint[]>()
    let adCreatedAt = new Map<string, string>()
    if (sources) {
      await sources.tracker
        .capture(actor.organizationId)
        .catch((error: unknown) => console.error("campaign_checkup.capture_failed", error))
      changes = await sources.tracker
        .list(actor, new Date(`${startDate}T00:00:00+03:00`), new Date(`${endDate}T23:59:59+03:00`))
        .catch(() => [])
      const adIds = [...adsByCampaignId.values()].flat().map((ad) => ad.id)
      const rowIds = [...new Set([...adIds, ...changes.map((change) => change.rowId)])]
      // A month back at least: enough days to see an ad tire, and the days before a change.
      const monthBack = addDays(endDate, -29)
      const from = addDays(startDate < monthBack ? startDate : monthBack, -EFFECT_DAYS)
      ;[history, adCreatedAt] = await Promise.all([
        sources.history.daily(actor, rowIds, from, endDate).catch(() => new Map()),
        sources.history.createdAt(actor, adIds).catch(() => new Map()),
      ])
    }

    return buildCheckup({
      campaigns,
      spendTodayByCampaignId: new Map(todayRows.map((row) => [row.id, row.spend])),
      spendYesterdayByCampaignId: new Map(yesterdayRows.map((row) => [row.id, row.spend])),
      adsByCampaignId,
      adSetBudgetByCampaignId,
      stoppedAdSetIds,
      range: { startDate, endDate, days },
      history,
      adCreatedAt,
      changes,
      now: this.now(),
    })
  }
}
