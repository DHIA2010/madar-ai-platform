import type {
  AttributionComparison,
  AttributionComparisonReadModel,
  AttributionComparisonViewModel,
  AttributionResult,
  CampaignPerformance,
  CampaignPerformanceReadModel,
  CampaignPerformanceViewModel,
  ChannelPerformance,
  ChannelPerformanceReadModel,
  ChannelPerformanceViewModel,
  ConversionReadModel,
  ConversionViewModel,
  JourneyAttributionReadModel,
  JourneyAttributionViewModel,
  ROASReadModel,
  ROASViewModel,
  ROIReadModel,
  ROIViewModel,
  RoasMetrics,
  RoiMetrics,
  SourcePerformance,
  SourcePerformanceReadModel,
  SourcePerformanceViewModel,
} from "../contracts"
import { createReadModel } from "../read-models"

export function mapJourneyAttributionToReadModel(
  payload: AttributionResult
): JourneyAttributionReadModel {
  return createReadModel({
    id: `journey-attribution:${payload.journeyId}:${payload.conversionId}:${payload.model}`,
    owner: "attribution",
    sourceDomains: ["attribution", "customer-intelligence", "campaigns"],
    payload,
  })
}

export function mapJourneyAttributionReadModelToViewModel(
  readModel: JourneyAttributionReadModel
): JourneyAttributionViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapCampaignPerformanceToReadModel(
  payload: CampaignPerformance[]
): CampaignPerformanceReadModel {
  return createReadModel({
    id: "campaign-performance:all",
    owner: "attribution",
    sourceDomains: ["attribution", "campaigns"],
    payload,
  })
}

export function mapCampaignPerformanceReadModelToViewModel(
  readModel: CampaignPerformanceReadModel
): CampaignPerformanceViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapChannelPerformanceToReadModel(
  payload: ChannelPerformance[]
): ChannelPerformanceReadModel {
  return createReadModel({
    id: "channel-performance:all",
    owner: "attribution",
    sourceDomains: ["attribution", "campaigns"],
    payload,
  })
}

export function mapChannelPerformanceReadModelToViewModel(
  readModel: ChannelPerformanceReadModel
): ChannelPerformanceViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapSourcePerformanceToReadModel(
  payload: SourcePerformance[]
): SourcePerformanceReadModel {
  return createReadModel({
    id: "source-performance:all",
    owner: "attribution",
    sourceDomains: ["attribution", "campaigns"],
    payload,
  })
}

export function mapSourcePerformanceReadModelToViewModel(
  readModel: SourcePerformanceReadModel
): SourcePerformanceViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapAttributionComparisonToReadModel(
  payload: AttributionComparison
): AttributionComparisonReadModel {
  return createReadModel({
    id: `attribution-comparison:${payload.journeyId}:${payload.conversionId}`,
    owner: "attribution",
    sourceDomains: ["attribution", "customer-intelligence", "campaigns"],
    payload,
  })
}

export function mapAttributionComparisonReadModelToViewModel(
  readModel: AttributionComparisonReadModel
): AttributionComparisonViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapConversionAttributionsToReadModel(
  payload: AttributionResult[]
): ConversionReadModel {
  return createReadModel({
    id: payload[0]
      ? `conversion-attribution:${payload[0].journeyId}:${payload[0].conversionId}`
      : "conversion-attribution:empty",
    owner: "attribution",
    sourceDomains: ["attribution", "customer-intelligence", "campaigns"],
    payload,
  })
}

export function mapConversionReadModelToViewModel(
  readModel: ConversionReadModel
): ConversionViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapRoiToReadModel(payload: RoiMetrics): ROIReadModel {
  return createReadModel({
    id: `roi:${payload.campaignId}`,
    owner: "attribution",
    sourceDomains: ["attribution", "campaigns"],
    payload,
  })
}

export function mapRoiReadModelToViewModel(readModel: ROIReadModel): ROIViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapRoasToReadModel(payload: RoasMetrics): ROASReadModel {
  return createReadModel({
    id: `roas:${payload.campaignId}`,
    owner: "attribution",
    sourceDomains: ["attribution", "campaigns"],
    payload,
  })
}

export function mapRoasReadModelToViewModel(readModel: ROASReadModel): ROASViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}
