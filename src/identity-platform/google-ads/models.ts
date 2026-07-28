export type GoogleAdsEntityType =
  | "customer_account"
  | "campaign"
  | "campaign_metric"
  | "ad_group"
  | "ad_group_metric"
  | "ad"
  | "ad_metric"
  | "keyword"
  | "keyword_metric"
  | "search_term"
  | "geo_metric"
  | "device_metric"
  | "conversion_action"

export interface CustomerAccount {
  id: string
  name: string
  currencyCode: string | null
  timeZone: string | null
  manager: boolean
  level: number
  parentCustomerId: string | null
}

export interface Campaign {
  id: string
  customerId: string
  name: string
  status: string
  budgetMicros: number | null
  biddingStrategyType: string | null
  channelType?: string | null
  startDate?: string | null
  endDate?: string | null
}

export interface CampaignMetric {
  campaignId: string
  customerId: string
  date: string
  costMicros: number
  clicks: number
  impressions: number
  ctr: number
  cpcMicros: number
  cpmMicros: number
  conversions: number
  conversionValue: number
  roas: number
}

export interface AdGroup {
  id: string
  campaignId: string
  customerId: string
  name: string
  status: string
}

export interface AdGroupMetric {
  adGroupId: string
  campaignId: string
  customerId: string
  date: string
  costMicros: number
  clicks: number
  impressions: number
  conversions: number
}

export interface Ad {
  id: string
  adGroupId: string
  campaignId: string
  customerId: string
  status: string
  type: string
  headline: string | null
}

export interface AdMetric {
  adId: string
  adGroupId: string
  campaignId: string
  customerId: string
  date: string
  costMicros: number
  clicks: number
  impressions: number
  conversions: number
}

export interface Keyword {
  id: string
  adGroupId: string
  campaignId: string
  customerId: string
  text: string
  matchType: string
  status: string
}

export interface KeywordMetric {
  keywordId: string
  customerId: string
  date: string
  costMicros: number
  clicks: number
  impressions: number
  conversions: number
}

export interface SearchTerm {
  id: string
  keywordId: string | null
  customerId: string
  term: string
  date: string
  clicks: number
  impressions: number
  conversions: number
  costMicros: number
}

export interface GeoMetric {
  id: string
  customerId: string
  locationName: string
  date: string
  clicks: number
  impressions: number
  conversions: number
  costMicros: number
}

export interface DeviceMetric {
  id: string
  customerId: string
  device: "desktop" | "mobile" | "tablet" | "unknown"
  date: string
  clicks: number
  impressions: number
  conversions: number
  costMicros: number
}

export interface ConversionAction {
  id: string
  customerId: string
  name: string
  category: string
  status: string
  type: string
}

export interface GoogleAdsNormalizedBundle {
  customers: CustomerAccount[]
  campaigns: Campaign[]
  campaignMetrics: CampaignMetric[]
  adGroups: AdGroup[]
  adGroupMetrics: AdGroupMetric[]
  ads: Ad[]
  adMetrics: AdMetric[]
  keywords: Keyword[]
  keywordMetrics: KeywordMetric[]
  searchTerms: SearchTerm[]
  geoMetrics: GeoMetric[]
  deviceMetrics: DeviceMetric[]
  conversionActions: ConversionAction[]
}
