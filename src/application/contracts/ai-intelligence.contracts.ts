import type { ReadModel, ReadModelViewModel } from "./read-model.contracts"

export type AIInsightTone = "success" | "info" | "warning" | "error" | "neutral"

export interface AIInsightItemDto {
  id: string
  title: string
  detail: string
  impact: string
  tone: AIInsightTone
}

export interface AIChannelPerformanceDto {
  channel: string
  spend: number
  revenue: number
  roas: number
  cpa: number
  ctr: number
  conversions: number
  spendShare: number
}

export interface AICampaignInsightDto {
  campaignId: string
  campaignName: string
  channel: string
  spend: number
  revenue: number
  roas: number
  ctr: number
  conversionRate: number
  anomaly?: string
}

export interface AIProductInsightDto {
  productId: string
  productName: string
  revenue: number
  unitsSold: number
  margin: number
  trend: "up" | "down" | "flat"
  insight: string
}

export interface AICustomerInsightDto {
  segment: string
  acquisitionChannel: string
  ltv: number
  cac: number
  paybackDays: number
  repeatRate: number
  insight: string
}

export interface AIAnomalyDto {
  id: string
  title: string
  detail: string
  severity: "low" | "medium" | "high"
  detectedAt: string
}

export interface AIWeeklySummaryDto {
  wins: string[]
  watchouts: string[]
  nextActions: string[]
}

export interface AIIntelligenceDashboardDto {
  workspaceId: string
  generatedAt: string
  executiveSummary: string
  marketingHealthScore: {
    score: number
    delta: number
    label: string
  }
  keyInsights: AIInsightItemDto[]
  opportunities: AIInsightItemDto[]
  risks: AIInsightItemDto[]
  recommendations: AIInsightItemDto[]
  budgetAnalysis: AIChannelPerformanceDto[]
  roasAnalysis: Array<{ day: string; roas: number; revenue: number; spend: number }>
  channelPerformance: AIChannelPerformanceDto[]
  campaignInsights: AICampaignInsightDto[]
  productInsights: AIProductInsightDto[]
  customerInsights: AICustomerInsightDto[]
  anomalyDetection: AIAnomalyDto[]
  weeklySummary: AIWeeklySummaryDto
}

export interface AIIntelligenceQueryDto {
  workspaceId: string | null
  period: "7d" | "30d" | "90d"
}

export interface AIIntelligenceGateway {
  getIntelligenceDashboard(input: AIIntelligenceQueryDto): Promise<AIIntelligenceDashboardDto>
}

export type AIIntelligenceRepository = AIIntelligenceGateway

export type AIIntelligenceReadModel = ReadModel<AIIntelligenceDashboardDto>
export type AIIntelligenceViewModel = ReadModelViewModel<AIIntelligenceDashboardDto>
