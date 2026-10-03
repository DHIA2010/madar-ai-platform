// Shared vocabulary for the deterministic campaign analytics layer (analytics-engine.ts,
// confidence-engine.ts, recommendation-engine.ts). Every number that reaches these types has
// already been computed from real synced data by CampaignsPerformanceAggregationService /
// ChannelsAggregationService -- nothing here is ever filled in by an LLM.

export type ConfidenceLevel = "high" | "medium" | "low" | "insufficient"

// Account/campaign-level metric set actually derivable today. Deliberately excludes reach,
// frequency, creative/audience/geo/device breakdowns, and attribution -- those aren't computed
// anywhere in campaigns/performance-service.ts at the summary level, so claiming them here would
// be exactly the kind of invented metric this engine exists to prevent. cpc/cpm are derived
// (spend/clicks, spend/impressions*1000) since CampaignPerformanceSummary doesn't carry them
// directly, guarded against division by zero.
export interface MetricSnapshot {
  spend: number
  revenue: number
  roas: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  conversions: number
  conversionRate: number
  cpa: number
  activeCampaigns: number
}

export type MetricKey = keyof MetricSnapshot

export interface MetricDelta {
  metric: MetricKey
  current: number
  previous: number
  // null (not Infinity/NaN) when previous is 0 -- an undefined percentage change is a real,
  // reportable fact ("no prior baseline"), not an error to paper over.
  changePercent: number | null
  changeAbsolute: number
}

export interface SampleSize {
  spend: number
  clicks: number
  conversions: number
  days: number
}

export interface ChannelFreshness {
  channel: string
  connected: boolean
  lastSyncedAt: string | null
  minutesSinceSync: number | null
  isStale: boolean
}

export interface PeriodRange {
  from: string
  to: string
}

export interface PeriodComparisonResult {
  period: { current: PeriodRange; previous: PeriodRange }
  current: MetricSnapshot
  previous: MetricSnapshot
  deltas: MetricDelta[]
  freshness: ChannelFreshness[]
  sampleSize: SampleSize
  confidence: ConfidenceLevel
}

export interface ChannelComparisonRow {
  channel: string
  metrics: MetricSnapshot
  freshness: ChannelFreshness
  sampleSize: SampleSize
  confidence: ConfidenceLevel
}

export interface CampaignRow {
  id: string
  name: string
  platform: string
  status: string
  metrics: MetricSnapshot
  sampleSize: SampleSize
  confidence: ConfidenceLevel
}

export interface CampaignDeclineRow extends CampaignRow {
  previousMetrics: MetricSnapshot
  deltas: MetricDelta[]
}

export type AnomalyType =
  | "spend_spike"
  | "spend_drop"
  | "stale_sync"
  | "roas_drop"
  | "cpa_spike"
  | "ctr_collapse"
  | "cpc_spike"
  | "conversion_rate_drop"

export interface AnomalyFlag {
  type: AnomalyType
  scope: "channel" | "campaign"
  entityId: string | null
  entityName: string
  severity: "warning" | "critical"
  detail: string
  changePercent?: number | null
}

// A single comparative observation, deliberately worded to never assert causation -- see
// recommendation-engine.ts's language guard. "narrative" uses hedged phrasing only
// ("appears associated with", "the largest observed change is") per the product requirement
// that correlation never gets reported as causation.
export interface PerformanceDriver {
  metric: MetricKey
  changePercent: number | null
  changeAbsolute: number
  direction: "up" | "down"
  magnitudeRank: number
  narrative: string
}

export interface ContributionRow {
  entityId: string
  entityName: string
  spend: number
  revenue: number
  spendShare: number
  revenueShare: number
  // Only meaningful (non-null) when the account-level metric actually declined overall --
  // a campaign "contributing to a loss" that didn't happen is a meaningless number.
  revenueDeltaAbsolute: number | null
  roasDeteriorationScore: number | null
}

export interface AnalyticalEvidence {
  metric: string
  currentValue: number | null
  previousValue: number | null
  changePercent: number | null
  period: { current: string; previous?: string }
  entity?: { type: "campaign" | "channel" | "account"; id: string; name: string }
  source: string
  dataFreshness?: string
  sampleSize?: number
  confidence: ConfidenceLevel
}

export type RecommendationType =
  | "budget_review"
  | "budget_increase_consideration"
  | "investigate_decline"
  | "investigate_inefficiency"
  | "review_targeting"
  | "review_creative"
  | "no_action"

export interface CampaignRecommendation {
  type: RecommendationType
  priority: "high" | "medium" | "low"
  entityType: "campaign" | "channel" | "account"
  entityId: string | null
  entityName: string
  reason: string
  evidence: AnalyticalEvidence[]
  confidence: ConfidenceLevel
  recommendedAction: string
}
