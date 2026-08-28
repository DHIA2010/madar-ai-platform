// "audiences"/"placements"/"creatives" were dropped -- no platform sync produces real data for
// these, so they're not offered as drill-down levels rather than showing fabricated numbers
// (see the Campaigns dashboard plan's Phase 7 UX decision).
export type AnalysisTab = "campaigns" | "adGroups" | "ads" | "keywords"

export type ExplorerLevel = "platforms" | AnalysisTab

export type ExplorerPlatformFilter =
  | "All Platforms"
  | "Google Search"
  | "Google Display"
  | "YouTube"
  | "Meta"
  | "TikTok"
  | "Snapchat"

export type CampaignTypeFilter =
  | "All Objectives"
  | "Awareness"
  | "Traffic"
  | "Leads"
  | "Conversions"
  | "Sales"

// LinkedIn was dropped -- there's no LinkedIn Ads connector anywhere in this codebase (no
// OAuth, no sync), so it was always a dead, permanently-empty filter option.
export type CampaignPlatform = Exclude<ExplorerPlatformFilter, "All Platforms">

export type PlatformNodeKey = "Google" | "Meta" | "TikTok" | "YouTube" | "Snapchat"

export type MetricColumnKind = "number" | "percent" | "currency" | "ratio" | "duration" | "text"

export type MetricColumnKey =
  | "entity"
  | "platform"
  | "activeCampaigns"
  | "status"
  | "spend"
  | "revenue"
  | "roas"
  | "clicks"
  | "conversions"
  | "conversionRate"
  | "ctr"
  | "cpc"
  | "cpa"
  | "impressions"
  | "cost"
  | "qualityScore"
  | "impressionShare"
  | "searchTopImpressionRate"
  | "cpm"
  | "viewableImpressions"
  | "viewability"
  | "views"
  | "viewRate"
  | "watchTime"
  | "averageViewDuration"
  | "view25"
  | "view50"
  | "view75"
  | "view100Completion"
  | "reach"
  | "frequency"
  | "videoPlays"
  | "threeSecondViews"
  | "thruPlays"
  | "addToCart"
  | "checkoutStarted"
  | "purchases"
  | "purchaseValue"

export type MetricColumn = {
  key: MetricColumnKey
  label: string
  kind: MetricColumnKind
}

export type PlatformHierarchySpec = {
  path: ExplorerLevel[]
  tabs: AnalysisTab[]
  adGroupLabel: "Ad Groups" | "Ad Sets" | "Ad Squads"
}

export const PLATFORM_NODE_CONFIG: Record<
  PlatformNodeKey,
  { campaignPlatforms: CampaignPlatform[] }
> = {
  Google: { campaignPlatforms: ["Google Search", "Google Display"] },
  Meta: { campaignPlatforms: ["Meta"] },
  TikTok: { campaignPlatforms: ["TikTok"] },
  YouTube: { campaignPlatforms: ["YouTube"] },
  Snapchat: { campaignPlatforms: ["Snapchat"] },
}

export const CAMPAIGN_PLATFORM_HIERARCHY: Record<CampaignPlatform, PlatformHierarchySpec> = {
  "Google Search": {
    path: ["platforms", "campaigns", "adGroups", "keywords"],
    tabs: ["campaigns", "adGroups", "keywords"],
    adGroupLabel: "Ad Groups",
  },
  "Google Display": {
    path: ["platforms", "campaigns", "adGroups", "ads"],
    tabs: ["campaigns", "adGroups", "ads"],
    adGroupLabel: "Ad Groups",
  },
  YouTube: {
    path: ["platforms", "campaigns", "adGroups", "ads"],
    tabs: ["campaigns", "adGroups", "ads"],
    adGroupLabel: "Ad Groups",
  },
  Meta: {
    path: ["platforms", "campaigns", "adGroups", "ads"],
    tabs: ["campaigns", "adGroups", "ads"],
    adGroupLabel: "Ad Sets",
  },
  TikTok: {
    path: ["platforms", "campaigns", "adGroups", "ads"],
    tabs: ["campaigns", "adGroups", "ads"],
    adGroupLabel: "Ad Groups",
  },
  Snapchat: {
    path: ["platforms", "campaigns", "adGroups", "ads"],
    tabs: ["campaigns", "adGroups", "ads"],
    adGroupLabel: "Ad Squads",
  },
}

export const ANALYSIS_TABS: Array<{ key: AnalysisTab; label: string }> = [
  { key: "campaigns", label: "Campaigns" },
  { key: "adGroups", label: "Ad Groups" },
  { key: "ads", label: "Ads" },
  { key: "keywords", label: "Keywords" },
]

const platformOverviewColumns: MetricColumn[] = [
  { key: "entity", label: "Platform", kind: "text" },
  { key: "activeCampaigns", label: "Active Campaigns", kind: "number" },
  { key: "impressions", label: "Impressions", kind: "number" },
  { key: "clicks", label: "Clicks", kind: "number" },
  { key: "ctr", label: "CTR", kind: "percent" },
  { key: "spend", label: "Spend", kind: "currency" },
  { key: "revenue", label: "Revenue", kind: "currency" },
  { key: "roas", label: "ROAS", kind: "ratio" },
  { key: "conversions", label: "Conversions", kind: "number" },
  { key: "status", label: "Status", kind: "text" },
]

const commonComparableColumns: MetricColumn[] = [
  { key: "spend", label: "Spend", kind: "currency" },
  { key: "revenue", label: "Revenue", kind: "currency" },
  { key: "roas", label: "ROAS", kind: "ratio" },
  { key: "clicks", label: "Clicks", kind: "number" },
  { key: "conversions", label: "Conversions", kind: "number" },
  { key: "ctr", label: "CTR", kind: "percent" },
  { key: "cpc", label: "CPC", kind: "currency" },
  { key: "cpa", label: "CPA", kind: "currency" },
  { key: "status", label: "Status", kind: "text" },
]

const googleSearchColumns: MetricColumn[] = [
  { key: "impressions", label: "Impressions", kind: "number" },
  { key: "clicks", label: "Clicks", kind: "number" },
  { key: "ctr", label: "CTR", kind: "percent" },
  { key: "cpc", label: "CPC", kind: "currency" },
  { key: "cost", label: "Cost", kind: "currency" },
  { key: "conversions", label: "Conversions", kind: "number" },
  { key: "revenue", label: "Revenue", kind: "currency" },
  { key: "roas", label: "ROAS", kind: "ratio" },
  { key: "qualityScore", label: "Quality Score", kind: "number" },
  { key: "impressionShare", label: "Impression Share", kind: "percent" },
  { key: "searchTopImpressionRate", label: "Top Impression Rate", kind: "percent" },
  { key: "status", label: "Status", kind: "text" },
]

const googleDisplayColumns: MetricColumn[] = [
  { key: "impressions", label: "Impressions", kind: "number" },
  { key: "clicks", label: "Clicks", kind: "number" },
  { key: "ctr", label: "CTR", kind: "percent" },
  { key: "cpm", label: "CPM", kind: "currency" },
  { key: "viewableImpressions", label: "Viewable Impressions", kind: "number" },
  { key: "viewability", label: "Viewability", kind: "percent" },
  { key: "spend", label: "Spend", kind: "currency" },
  { key: "revenue", label: "Revenue", kind: "currency" },
  { key: "roas", label: "ROAS", kind: "ratio" },
  { key: "status", label: "Status", kind: "text" },
]

const youtubeColumns: MetricColumn[] = [
  { key: "views", label: "Views", kind: "number" },
  { key: "viewRate", label: "View Rate", kind: "percent" },
  { key: "watchTime", label: "Watch Time", kind: "duration" },
  { key: "averageViewDuration", label: "Avg View Duration", kind: "duration" },
  { key: "view25", label: "25% View", kind: "percent" },
  { key: "view50", label: "50% View", kind: "percent" },
  { key: "view75", label: "75% View", kind: "percent" },
  { key: "view100Completion", label: "100% Completion", kind: "percent" },
  { key: "clicks", label: "Clicks", kind: "number" },
  { key: "spend", label: "Spend", kind: "currency" },
  { key: "revenue", label: "Revenue", kind: "currency" },
  { key: "roas", label: "ROAS", kind: "ratio" },
  { key: "status", label: "Status", kind: "text" },
]

const metaAwarenessColumns: MetricColumn[] = [
  { key: "reach", label: "Reach", kind: "number" },
  { key: "impressions", label: "Impressions", kind: "number" },
  { key: "frequency", label: "Frequency", kind: "number" },
  { key: "cpm", label: "CPM", kind: "currency" },
  { key: "videoPlays", label: "Video Plays", kind: "number" },
  { key: "threeSecondViews", label: "3-second Views", kind: "number" },
  { key: "thruPlays", label: "ThruPlays", kind: "number" },
  { key: "spend", label: "Spend", kind: "currency" },
  { key: "status", label: "Status", kind: "text" },
]

const metaSalesColumns: MetricColumn[] = [
  { key: "impressions", label: "Impressions", kind: "number" },
  { key: "clicks", label: "Clicks", kind: "number" },
  { key: "ctr", label: "CTR", kind: "percent" },
  { key: "cpc", label: "CPC", kind: "currency" },
  { key: "addToCart", label: "Add To Cart", kind: "number" },
  { key: "checkoutStarted", label: "Checkout Started", kind: "number" },
  { key: "purchases", label: "Purchases", kind: "number" },
  { key: "purchaseValue", label: "Purchase Value", kind: "currency" },
  { key: "spend", label: "Spend", kind: "currency" },
  { key: "revenue", label: "Revenue", kind: "currency" },
  { key: "roas", label: "ROAS", kind: "ratio" },
  { key: "status", label: "Status", kind: "text" },
]

const tiktokColumns: MetricColumn[] = [
  { key: "views", label: "Video Views", kind: "number" },
  { key: "watchTime", label: "Average Watch Time", kind: "duration" },
  { key: "ctr", label: "CTR", kind: "percent" },
  { key: "clicks", label: "Clicks", kind: "number" },
  { key: "cpc", label: "CPC", kind: "currency" },
  { key: "spend", label: "Spend", kind: "currency" },
  { key: "conversions", label: "Conversions", kind: "number" },
  { key: "revenue", label: "Revenue", kind: "currency" },
  { key: "roas", label: "ROAS", kind: "ratio" },
  { key: "status", label: "Status", kind: "text" },
]

const snapchatColumns: MetricColumn[] = [
  { key: "impressions", label: "Impressions", kind: "number" },
  { key: "clicks", label: "Swipes", kind: "number" },
  { key: "ctr", label: "Swipe Rate", kind: "percent" },
  { key: "cpm", label: "CPM", kind: "currency" },
  { key: "spend", label: "Spend", kind: "currency" },
  { key: "status", label: "Status", kind: "text" },
]

export function getEntityLabel(level: ExplorerLevel, campaignPlatform?: CampaignPlatform) {
  if (level === "platforms") return "Platform"
  if (level === "campaigns") return "Campaign"
  if (level === "adGroups") {
    if (campaignPlatform === "Meta") return "Ad Set"
    if (campaignPlatform === "Snapchat") return "Ad Squad"
    return "Ad Group"
  }
  if (level === "keywords") return "Keyword"
  return "Ad"
}

export function getNextHierarchyLevel(
  campaignPlatform: CampaignPlatform,
  currentLevel: ExplorerLevel
) {
  const path = CAMPAIGN_PLATFORM_HIERARCHY[campaignPlatform].path
  const currentIndex = path.indexOf(currentLevel)

  if (currentIndex < 0) {
    return undefined
  }

  return path[currentIndex + 1]
}

export function getAvailableTabsForPlatforms(platforms: CampaignPlatform[]) {
  const set = new Set<AnalysisTab>()

  for (const platform of platforms) {
    for (const tab of CAMPAIGN_PLATFORM_HIERARCHY[platform].tabs) {
      set.add(tab)
    }
  }

  return ANALYSIS_TABS.filter((tab) => set.has(tab.key))
}

export function getMetricsColumns({
  level,
  campaignPlatform,
  campaignType,
}: {
  level: ExplorerLevel
  campaignPlatform?: CampaignPlatform
  campaignType: CampaignTypeFilter
}): MetricColumn[] {
  if (level === "platforms") {
    return platformOverviewColumns
  }

  const leadingColumns: MetricColumn[] = [
    { key: "entity", label: getEntityLabel(level, campaignPlatform), kind: "text" },
  ]

  if (!campaignPlatform) {
    return [
      ...leadingColumns,
      { key: "platform", label: "Platform", kind: "text" },
      ...commonComparableColumns,
    ]
  }

  if (campaignPlatform === "Google Search") {
    return [...leadingColumns, ...googleSearchColumns]
  }

  if (campaignPlatform === "Google Display") {
    return [...leadingColumns, ...googleDisplayColumns]
  }

  if (campaignPlatform === "YouTube") {
    return [...leadingColumns, ...youtubeColumns]
  }

  if (campaignPlatform === "Meta") {
    return [
      ...leadingColumns,
      ...(campaignType === "Awareness" ? metaAwarenessColumns : metaSalesColumns),
    ]
  }

  if (campaignPlatform === "Snapchat") {
    return [...leadingColumns, ...snapchatColumns]
  }

  return [...leadingColumns, ...tiktokColumns]
}
