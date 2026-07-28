import type {
  AIAnomalyDto,
  AICampaignInsightDto,
  AIChannelPerformanceDto,
  AICustomerInsightDto,
  AIInsightItemDto,
  AIIntelligenceQueryDto,
  AIIntelligenceViewModel,
  AIProductInsightDto,
  AIWeeklySummaryDto,
} from "@/application/contracts"

export type {
  AIAnomalyDto,
  AICampaignInsightDto,
  AIChannelPerformanceDto,
  AICustomerInsightDto,
  AIInsightItemDto,
  AIProductInsightDto,
  AIWeeklySummaryDto,
}

export type AIIntelligenceInput = AIIntelligenceQueryDto
export type AIIntelligenceResult = AIIntelligenceViewModel
