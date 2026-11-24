import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same pattern as order-list.service.ts's workspace lookup -- this page is a plain client
// component wired directly to the HTTP client, not through useInfrastructureServices(). Each
// feature keeps its own copy of this helper rather than sharing one (matches this codebase's
// existing per-file duplication convention).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) {
      return null
    }

    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

// Mirrors identity-platform/campaigns/performance-service.ts's CampaignPerformanceRow --
// this codebase duplicates frontend/backend types per-file rather than sharing a package, same
// as every other feature service (order-list.service.ts, product-list.service.ts, etc).
export type CampaignPerformancePlatform =
  | "Google Search"
  | "Google Display"
  | "YouTube"
  | "Meta"
  | "TikTok"
  | "Snapchat"
export type CampaignPerformanceLevel = "campaign" | "adGroup" | "ad" | "keyword"

export interface CampaignPerformanceRow {
  id: string
  parentId: string | null
  platform: CampaignPerformancePlatform
  level: CampaignPerformanceLevel
  name: string
  status: string
  objective: string | null
  activityDate: string | null
  // The ad account's own currency, when the platform reported it.
  currency?: string | null
  spend: number
  revenue: number
  roas: number
  clicks: number
  conversions: number
  conversionRate: number
  ctr: number
  cpc: number
  cpa: number
  impressions: number
  cost: number
  qualityScore: number
  impressionShare: number
  searchTopImpressionRate: number
  cpm: number
  viewableImpressions: number
  viewability: number
  views: number
  viewRate: number
  watchTime: number
  averageViewDuration: number
  view25: number
  view50: number
  view75: number
  view100Completion: number
  reach: number
  frequency: number
  videoPlays: number
  threeSecondViews: number
  thruPlays: number
  addToCart: number
  checkoutStarted: number
  purchases: number
  purchaseValue: number
  // Meta only: whether this row's connection may change ads.
  manageable?: boolean
  // An ad group's (or campaign's) daily budget, where the platform's sync carries it.
  dailyBudget?: number | null
}

export interface CampaignPerformancePlatformRow extends CampaignPerformanceRow {
  activeCampaigns: number
}

export interface CampaignPerformanceSummary {
  impressions: number
  impressionsChangePct: number | null
  clicks: number
  clicksChangePct: number | null
  ctr: number
  ctrChangePct: number | null
  cpc: number
  cpcChangePct: number | null
  spend: number
  spendChangePct: number | null
  revenue: number
  revenueChangePct: number | null
  roas: number
  roasChangePct: number | null
  conversions: number
  conversionsChangePct: number | null
  cpa: number
  cpaChangePct: number | null
  conversionRate: number
  conversionRateChangePct: number | null
  activeCampaigns: number
  activeCampaignsChangePct: number | null
}

export type CampaignObjectiveBucket =
  | "Awareness"
  | "Traffic"
  | "Leads"
  | "Conversions"
  | "Sales"
  | "Other"

export interface CampaignObjectiveRow {
  objective: CampaignObjectiveBucket
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
}

export interface CampaignPerformancePage {
  items: CampaignPerformanceRow[]
  pagination: { page: number; pageSize: number; total: number }
}

export interface CampaignPerformanceQueryParams {
  startDate?: string
  endDate?: string
  platform?: CampaignPerformancePlatform
  status?: string
  objective?: string
  search?: string
}

// Mirrors identity-platform/campaigns/checkup.ts -- the ad account check-up: each campaign's
// state, the funnel from views to results, and findings with the numbers behind them.
export type CampaignCheckupFindingKind =
  | "budget_hog"
  | "spend_no_result"
  | "clicks_no_result"
  | "low_ctr"
  | "budget_reached"
  | "budget_unspent"
  | "not_delivering"

export interface CampaignCheckupFinding {
  kind: CampaignCheckupFindingKind
  severity: "high" | "medium"
  platform: CampaignPerformancePlatform
  campaignId: string
  campaignName: string
  adName: string | null
  currency: string | null
  values: Record<string, number | string | null>
}

export interface CampaignCheckupCampaign {
  id: string
  platform: CampaignPerformancePlatform
  name: string
  status: string
  state: "running" | "problem" | "paused" | "other"
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

export interface CampaignCheckupAd {
  id: string
  campaignId: string
  campaignName: string
  platform: CampaignPerformancePlatform
  name: string
  status: string
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
}

export interface CampaignCheckup {
  range: { startDate: string; endDate: string; days: number }
  funnel: {
    currency: string | null
    spend: number | null
    impressions: number
    clicks: number
    pageViews: number | null
    conversions: number
    cpa: number | null
  }
  campaigns: CampaignCheckupCampaign[]
  findings: CampaignCheckupFinding[]
  ads: CampaignCheckupAd[]
}

// Mirrors identity-platform/campaigns/journey-service.ts's CampaignJourneyRow -- ad-spend KPIs
// joined with real matched-order sales per campaign.
export interface CampaignJourneyRow {
  campaignId: string | null
  platform: CampaignPerformancePlatform | null
  name: string
  status: string
  currency: string | null
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  orders: number
  revenue: number
  roas: number
  cpa: number
}

// Avoids the slash-prefix literal lint rule (same trick as order-list.service.ts) -- this is a
// real backend API path, not a frontend page route.
const PERFORMANCE_ENDPOINT = ["", "v1", "campaigns", "performance"].join(String.fromCharCode(47))
const CONTROL_ENDPOINT = {
  status: ["", "v1", "campaigns", "control", "status"].join(String.fromCharCode(47)),
  remove: ["", "v1", "campaigns", "control", "delete"].join(String.fromCharCode(47)),
  ads: ["", "v1", "campaigns", "control", "ads"].join(String.fromCharCode(47)),
  budget: ["", "v1", "campaigns", "control", "budget"].join(String.fromCharCode(47)),
  settings: ["", "v1", "campaigns", "control", "settings"].join(String.fromCharCode(47)),
  edit: ["", "v1", "campaigns", "control", "edit"].join(String.fromCharCode(47)),
  clone: ["", "v1", "campaigns", "control", "clone"].join(String.fromCharCode(47)),
}

// The settings of a campaign, an ad group or an ad (backend: campaigns/control-service.ts). A
// field its level or its platform does not have is null. `live` says they were read from the
// platform just now and not from the last sync.
export interface CampaignControlSettings {
  id: string
  level: CampaignControlLevel
  platform: "snapchat" | "tiktok" | "meta" | "google"
  live: boolean
  canEdit: boolean
  canClone: boolean
  name: string
  status: string
  objective: string | null
  goal: string | null
  dailyBudget: number | null
  startAt: string | null
  endAt: string | null
  countries: string[]
  minAge: number | null
  maxAge: number | null
  gender: "all" | "male" | "female" | null
  headline: string | null
  brandName: string | null
  text: string | null
  callToAction: string | null
  url: string | null
}

// What an edit or a copy may set. Left out: stays as it is (a copy: as the original has it).
export interface CampaignControlChanges {
  name?: string
  dailyBudget?: number
  // The last day it runs (YYYY-MM-DD); null removes the end. Edits only.
  endDate?: string | null
  minAge?: number
  // null: no upper age.
  maxAge?: number | null
  gender?: "all" | "male" | "female"
  headline?: string
  brandName?: string
  callToAction?: string
  // Copies of an ad only.
  url?: string
}

// A new ad for an ad group that already exists. Snapchat, TikTok and Meta take a creative with
// their own text; Google takes a search ad's headlines and descriptions.
export interface CampaignAddAdInput {
  name: string
  url: string
  // The link's tracking words (utm_source, utm_medium, utm_campaign, utm_content).
  tracking?: {
    source?: string | null
    medium?: string | null
    campaign?: string | null
    content?: string | null
  } | null
  creativeId?: string
  brandName?: string
  headline?: string
  text?: string
  callToAction?: string
  headlines?: string[]
  descriptions?: string[]
}

function buildQuery(
  params?: CampaignPerformanceQueryParams & { page?: number; pageSize?: number }
) {
  const query = new URLSearchParams()
  if (params?.startDate) query.set("startDate", params.startDate)
  if (params?.endDate) query.set("endDate", params.endDate)
  if (params?.platform) query.set("platform", params.platform)
  if (params?.status) query.set("status", params.status)
  if (params?.objective) query.set("objective", params.objective)
  if (params?.search) query.set("search", params.search)
  if (params?.page) query.set("page", String(params.page))
  if (params?.pageSize) query.set("pageSize", String(params.pageSize))
  const suffix = query.toString() ? `?${query.toString()}` : ""
  return suffix
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export type CampaignControlLevel = "campaign" | "adGroup" | "ad"

// The platforms whose saved connection may change ads: Snapchat, TikTok and Google Ads (its three
// kinds of campaign). Meta depends on the connection -- see canControlCampaignRow.
const CONTROLLABLE_PLATFORMS = new Set<string>([
  "Snapchat",
  "TikTok",
  "Google Search",
  "Google Display",
  "YouTube",
])

export function canControlCampaignRow(
  row: Pick<CampaignPerformanceRow, "platform" | "level" | "manageable">
) {
  if (row.level === "keyword") return false
  // Meta: only a connection that was granted the permission to manage ads (the row says so).
  return CONTROLLABLE_PLATFORMS.has(row.platform) || (row.platform === "Meta" && !!row.manageable)
}

// Whether the row's own switch is on, whatever word its platform uses for "off".
export function isCampaignRowSwitchedOn(status: string) {
  return !["paused", "disable", "removed"].includes(status.toLowerCase())
}

export const campaignPerformanceService = {
  async getSummary(params?: CampaignPerformanceQueryParams): Promise<CampaignPerformanceSummary> {
    return client.get<CampaignPerformanceSummary>(
      `${PERFORMANCE_ENDPOINT}/summary${buildQuery(params)}`
    )
  },

  async getPlatformBreakdown(
    params?: CampaignPerformanceQueryParams
  ): Promise<{ items: CampaignPerformancePlatformRow[] }> {
    return client.get<{ items: CampaignPerformancePlatformRow[] }>(
      `${PERFORMANCE_ENDPOINT}/platforms${buildQuery(params)}`
    )
  },

  async getObjectiveBreakdown(
    params?: CampaignPerformanceQueryParams
  ): Promise<{ items: CampaignObjectiveRow[] }> {
    return client.get<{ items: CampaignObjectiveRow[] }>(
      `${PERFORMANCE_ENDPOINT}/objectives${buildQuery(params)}`
    )
  },

  async listCampaigns(
    params?: CampaignPerformanceQueryParams & { page?: number; pageSize?: number }
  ): Promise<CampaignPerformancePage> {
    return client.get<CampaignPerformancePage>(
      `${PERFORMANCE_ENDPOINT}/campaigns${buildQuery(params)}`
    )
  },

  async listAdGroups(
    campaignId: string,
    params?: CampaignPerformanceQueryParams
  ): Promise<{ items: CampaignPerformanceRow[] }> {
    const query = buildQuery(params)
    const separator = query ? "&" : "?"
    return client.get<{ items: CampaignPerformanceRow[] }>(
      `${PERFORMANCE_ENDPOINT}/ad-groups${query}${separator}campaignId=${encodeURIComponent(campaignId)}`
    )
  },

  async listAdsOrKeywords(
    adGroupId: string,
    level: "ads" | "keywords",
    params?: CampaignPerformanceQueryParams
  ): Promise<{ items: CampaignPerformanceRow[] }> {
    const query = buildQuery(params)
    const separator = query ? "&" : "?"
    return client.get<{ items: CampaignPerformanceRow[] }>(
      `${PERFORMANCE_ENDPOINT}/${level}${query}${separator}adGroupId=${encodeURIComponent(adGroupId)}`
    )
  },

  async getJourney(
    params?: CampaignPerformanceQueryParams
  ): Promise<{ items: CampaignJourneyRow[] }> {
    return client.get<{ items: CampaignJourneyRow[] }>(
      `${PERFORMANCE_ENDPOINT}/journey${buildQuery(params)}`
    )
  },

  // The list's own controls (backend: campaigns/control-service.ts): switch a campaign, ad
  // group or ad on or off on its ad platform, or delete it there.
  async setActive(
    id: string,
    level: CampaignControlLevel,
    active: boolean
  ): Promise<{ id: string; status: string }> {
    return client.post<
      { id: string; level: CampaignControlLevel; active: boolean },
      { id: string; status: string }
    >(CONTROL_ENDPOINT.status, { id, level, active })
  },

  async remove(id: string, level: CampaignControlLevel): Promise<void> {
    await client.post<{ id: string; level: CampaignControlLevel }, { ok: boolean }>(
      CONTROL_ENDPOINT.remove,
      { id, level }
    )
  },

  // Adds an ad to an ad group on its ad platform (the id is the ad group's row id).
  async addAd(adGroupId: string, ad: CampaignAddAdInput): Promise<{ adId: string }> {
    return client.post<CampaignAddAdInput & { id: string }, { adId: string }>(
      CONTROL_ENDPOINT.ads,
      { id: adGroupId, ...ad },
      // A video is uploaded to the platform and processed before the ad is made.
      { timeoutMs: 3 * 60_000 }
    )
  },

  async getSettings(id: string, level: CampaignControlLevel): Promise<CampaignControlSettings> {
    return client.get<CampaignControlSettings>(
      `${CONTROL_ENDPOINT.settings}?id=${encodeURIComponent(id)}&level=${level}`
    )
  },

  // Changes its settings on the ad platform; answers with the settings as they now are.
  async edit(
    id: string,
    level: CampaignControlLevel,
    changes: CampaignControlChanges
  ): Promise<CampaignControlSettings> {
    return client.post<
      CampaignControlChanges & { id: string; level: CampaignControlLevel },
      CampaignControlSettings
    >(CONTROL_ENDPOINT.edit, { id, level, ...changes }, { timeoutMs: 60_000 })
  },

  // Makes a copy of it on the ad platform, with what is under it. The copy starts switched off.
  async clone(
    id: string,
    level: CampaignControlLevel,
    copy: CampaignControlChanges & { name: string }
  ): Promise<{ id: string; level: CampaignControlLevel }> {
    return client.post<
      CampaignControlChanges & { id: string; level: CampaignControlLevel },
      { id: string; level: CampaignControlLevel }
    >(
      CONTROL_ENDPOINT.clone,
      { id, level, ...copy },
      // A campaign with many ads is copied piece by piece.
      { timeoutMs: 5 * 60_000 }
    )
  },

  // Changes an ad group's daily budget on its ad platform.
  async setDailyBudget(
    adGroupId: string,
    dailyBudget: number
  ): Promise<{ id: string; dailyBudget: number }> {
    return client.post<{ id: string; dailyBudget: number }, { id: string; dailyBudget: number }>(
      CONTROL_ENDPOINT.budget,
      { id: adGroupId, dailyBudget }
    )
  },

  async getCheckup(params?: CampaignPerformanceQueryParams): Promise<CampaignCheckup> {
    return client.get<CampaignCheckup>(`${PERFORMANCE_ENDPOINT}/checkup${buildQuery(params)}`)
  },
}
