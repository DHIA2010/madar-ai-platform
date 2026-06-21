import type {
  AttributionReadModel,
  AttributionViewModel,
  CampaignAttributionDto,
  CustomerJourneyDto,
  CustomerTimelineDto,
  JourneyReadModel,
  JourneyViewModel,
  ProductInterestDto,
  ProductInterestReadModel,
  ProductInterestViewModel,
  SessionDto,
  SessionReadModel,
  SessionViewModel,
  TimelineReadModel,
  TimelineViewModel,
  TrafficSourceReadModel,
  TrafficSourceStatsDto,
  TrafficSourceViewModel,
  VisitorSummaryDto,
  VisitorSummaryReadModel,
  VisitorSummaryViewModel,
} from "../contracts"
import { createReadModel } from "../read-models"

export function mapJourneyDtoToReadModel(payload: CustomerJourneyDto): JourneyReadModel {
  return createReadModel({
    id: `customer-journey:${payload.journeyId}`,
    owner: "customer-intelligence",
    sourceDomains: ["customer-intelligence"],
    payload,
  })
}

export function mapJourneyReadModelToViewModel(readModel: JourneyReadModel): JourneyViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapVisitorSummaryDtoToReadModel(
  payload: VisitorSummaryDto
): VisitorSummaryReadModel {
  return createReadModel({
    id: `visitor-summary:${payload.visitor.visitorId}`,
    owner: "customer-intelligence",
    sourceDomains: ["customer-intelligence"],
    payload,
  })
}

export function mapVisitorSummaryReadModelToViewModel(
  readModel: VisitorSummaryReadModel
): VisitorSummaryViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapSessionDtoToReadModel(payload: SessionDto): SessionReadModel {
  return createReadModel({
    id: `session:${payload.sessionId}`,
    owner: "customer-intelligence",
    sourceDomains: ["customer-intelligence"],
    payload,
  })
}

export function mapSessionReadModelToViewModel(readModel: SessionReadModel): SessionViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapTimelineDtoToReadModel(payload: CustomerTimelineDto): TimelineReadModel {
  return createReadModel({
    id: `customer-timeline:${payload.customerId}`,
    owner: "customer-intelligence",
    sourceDomains: ["customer-intelligence"],
    payload,
  })
}

export function mapTimelineReadModelToViewModel(readModel: TimelineReadModel): TimelineViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapTrafficSourcesDtoToReadModel(
  payload: TrafficSourceStatsDto[]
): TrafficSourceReadModel {
  return createReadModel({
    id: "traffic-sources:all",
    owner: "customer-intelligence",
    sourceDomains: ["customer-intelligence"],
    payload,
  })
}

export function mapTrafficSourcesReadModelToViewModel(
  readModel: TrafficSourceReadModel
): TrafficSourceViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapCampaignAttributionDtoToReadModel(
  payload: CampaignAttributionDto[]
): AttributionReadModel {
  return createReadModel({
    id: "campaign-attribution:all",
    owner: "customer-intelligence",
    sourceDomains: ["customer-intelligence"],
    payload,
  })
}

export function mapCampaignAttributionReadModelToViewModel(
  readModel: AttributionReadModel
): AttributionViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapProductInterestDtoToReadModel(
  payload: ProductInterestDto[]
): ProductInterestReadModel {
  return createReadModel({
    id: "product-interest:all",
    owner: "customer-intelligence",
    sourceDomains: ["customer-intelligence"],
    payload,
  })
}

export function mapProductInterestReadModelToViewModel(
  readModel: ProductInterestReadModel
): ProductInterestViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}
