export interface DailyMetricPoint {
  metricDate: string
  clicks: number
  sessions: number
  ordersCount: number
  revenue: number
  currency: string | null
}

export interface CampaignLinkSummaryRow {
  id: string
  displayId: string
  name: string
  campaignId: string
  trackingType: string
  enabled: boolean
  shortUrl: string | null
  finalUrl: string
  clicks: number
  sessions: number
  ordersCount: number
  revenue: number
  createdAt: string
}

export interface MatchMethodBreakdownRow {
  matchMethod: string
  ordersCount: number
  revenue: number
}

export interface CampaignLinkAttributionDetail {
  daily: DailyMetricPoint[]
  byMatchMethod: MatchMethodBreakdownRow[]
}

export interface RollupResult {
  metricDate: string
  campaignLinksUpdated: number
  campaignsUpdated: number
}
