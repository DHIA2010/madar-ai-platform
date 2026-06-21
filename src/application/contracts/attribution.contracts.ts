import type { ReadModel, ReadModelViewModel } from "./read-model.contracts"

export type AttributionModel =
  | "first_touch"
  | "last_touch"
  | "linear"
  | "time_decay"
  | "position_based"
  | "data_driven"
  | "custom"

export interface Channel {
  id: string
  name: string
}

export interface Source {
  id: string
  name: string
}

export interface Medium {
  id: string
  name: string
}

export interface Campaign {
  id: string
  name: string
}

export interface CampaignGroup {
  id: string
  name: string
}

export interface Creative {
  id: string
  name: string
}

export interface Ad {
  id: string
  name: string
}

export interface Keyword {
  id: string
  term: string
}

export interface Referral {
  id: string
  domain: string
}

export interface Touchpoint {
  touchpointId: string
  journeyId: string
  occurredAt: string
  channel: Channel
  source: Source
  medium: Medium
  campaign: Campaign
  campaignGroup?: CampaignGroup
  creative?: Creative
  ad?: Ad
  keyword?: Keyword
  referral?: Referral
}

export interface Conversion {
  conversionId: string
  journeyId: string
  occurredAt: string
  revenue: number
  conversions: number
  cpa: number
  cac: number
}

export interface CustomerJourneyStep {
  stepId: string
  journeyId: string
  index: number
  touchpointId: string
  occurredAt: string
}

export interface AttributionCredit {
  touchpointId: string
  channelId: string
  campaignId: string
  creativeId?: string
  credit: number
  attributedRevenue: number
  attributedConversions: number
}

export interface AttributionResult {
  journeyId: string
  conversionId: string
  model: AttributionModel
  totalRevenue: number
  totalConversions: number
  credits: AttributionCredit[]
}

export interface CampaignPerformance {
  campaignId: string
  campaignName: string
  conversions: number
  revenue: number
  spend: number
  roi: number
  roas: number
}

export interface ChannelPerformance {
  channelId: string
  channelName: string
  conversions: number
  revenue: number
  spend: number
  roi: number
  roas: number
  conversionRate: number
}

export interface SourcePerformance {
  sourceId: string
  sourceName: string
  conversions: number
  revenue: number
  conversionRate: number
}

export interface AttributionComparison {
  journeyId: string
  conversionId: string
  models: Array<{
    model: AttributionModel
    credits: AttributionCredit[]
    topChannelId?: string
    topCampaignId?: string
  }>
}

export interface RoiMetrics {
  campaignId: string
  roi: number
  revenue: number
  spend: number
}

export interface RoasMetrics {
  campaignId: string
  roas: number
  revenue: number
  spend: number
}

export interface CalculateAttributionRequestDto {
  journeyId: string
  conversionId: string
  model: AttributionModel
  customWeights?: Record<string, number>
}

export interface RecalculateJourneyRequestDto {
  journeyId: string
  conversionId: string
  models: AttributionModel[]
  customWeights?: Record<string, number>
}

export interface PreviewAttributionRequestDto {
  journeyId: string
  conversionRevenue: number
  model: AttributionModel
  customWeights?: Record<string, number>
}

export interface AttributionRepository {
  calculateAttribution(input: CalculateAttributionRequestDto): Promise<AttributionResult>
  recalculateJourney(input: RecalculateJourneyRequestDto): Promise<AttributionComparison>
  getJourneyTouchpoints(journeyId: string): Promise<Touchpoint[]>
  getConversionAttribution(journeyId: string, conversionId: string): Promise<AttributionResult[]>
  getCampaignROI(campaignId: string): Promise<RoiMetrics | null>
  getCampaignROAS(campaignId: string): Promise<RoasMetrics | null>
  getChannelPerformance(): Promise<ChannelPerformance[]>
  compareAttributionModels(input: RecalculateJourneyRequestDto): Promise<AttributionComparison>
  previewAttribution(input: PreviewAttributionRequestDto): Promise<AttributionResult>
}

export type AttributionGateway = AttributionRepository

export type JourneyAttributionReadModel = ReadModel<AttributionResult>
export type JourneyAttributionViewModel = ReadModelViewModel<AttributionResult>

export type CampaignPerformanceReadModel = ReadModel<CampaignPerformance[]>
export type CampaignPerformanceViewModel = ReadModelViewModel<CampaignPerformance[]>

export type ChannelPerformanceReadModel = ReadModel<ChannelPerformance[]>
export type ChannelPerformanceViewModel = ReadModelViewModel<ChannelPerformance[]>

export type SourcePerformanceReadModel = ReadModel<SourcePerformance[]>
export type SourcePerformanceViewModel = ReadModelViewModel<SourcePerformance[]>

export type AttributionComparisonReadModel = ReadModel<AttributionComparison>
export type AttributionComparisonViewModel = ReadModelViewModel<AttributionComparison>

export type ConversionReadModel = ReadModel<AttributionResult[]>
export type ConversionViewModel = ReadModelViewModel<AttributionResult[]>

export type ROIReadModel = ReadModel<RoiMetrics>
export type ROIViewModel = ReadModelViewModel<RoiMetrics>

export type ROASReadModel = ReadModel<RoasMetrics>
export type ROASViewModel = ReadModelViewModel<RoasMetrics>
