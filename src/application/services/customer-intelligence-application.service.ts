import type {
  AttachIdentityRequestDto,
  AttributionViewModel,
  CustomerIntelligenceGateway,
  EndSessionRequestDto,
  GetJourneyRequestDto,
  JourneyViewModel,
  ProductInterestViewModel,
  SessionViewModel,
  StartSessionRequestDto,
  TimelineViewModel,
  TrackEventRequestDto,
  TrafficSourceViewModel,
  VisitorSummaryViewModel,
} from "../contracts"
import {
  AttachIdentityUseCase,
  EndSessionUseCase,
  GetCampaignAttributionUseCase,
  GetCustomerTimelineUseCase,
  GetJourneyUseCase,
  GetProductInterestUseCase,
  GetTrafficSourcesUseCase,
  GetVisitorHistoryUseCase,
  StartSessionUseCase,
  TrackEventUseCase,
} from "../use-cases"

export class CustomerIntelligenceApplicationService {
  private readonly startSessionUseCase: StartSessionUseCase
  private readonly endSessionUseCase: EndSessionUseCase
  private readonly trackEventUseCase: TrackEventUseCase
  private readonly attachIdentityUseCase: AttachIdentityUseCase
  private readonly getJourneyUseCase: GetJourneyUseCase
  private readonly getVisitorHistoryUseCase: GetVisitorHistoryUseCase
  private readonly getCustomerTimelineUseCase: GetCustomerTimelineUseCase
  private readonly getTrafficSourcesUseCase: GetTrafficSourcesUseCase
  private readonly getCampaignAttributionUseCase: GetCampaignAttributionUseCase
  private readonly getProductInterestUseCase: GetProductInterestUseCase

  constructor(gateway: CustomerIntelligenceGateway) {
    this.startSessionUseCase = new StartSessionUseCase(gateway)
    this.endSessionUseCase = new EndSessionUseCase(gateway)
    this.trackEventUseCase = new TrackEventUseCase(gateway)
    this.attachIdentityUseCase = new AttachIdentityUseCase(gateway)
    this.getJourneyUseCase = new GetJourneyUseCase(gateway)
    this.getVisitorHistoryUseCase = new GetVisitorHistoryUseCase(gateway)
    this.getCustomerTimelineUseCase = new GetCustomerTimelineUseCase(gateway)
    this.getTrafficSourcesUseCase = new GetTrafficSourcesUseCase(gateway)
    this.getCampaignAttributionUseCase = new GetCampaignAttributionUseCase(gateway)
    this.getProductInterestUseCase = new GetProductInterestUseCase(gateway)
  }

  startSession(input: StartSessionRequestDto): Promise<SessionViewModel> {
    return this.startSessionUseCase.execute(input)
  }

  endSession(input: EndSessionRequestDto): Promise<SessionViewModel | null> {
    return this.endSessionUseCase.execute(input)
  }

  trackEvent(input: TrackEventRequestDto): Promise<VisitorSummaryViewModel> {
    return this.trackEventUseCase.execute(input)
  }

  attachIdentity(input: AttachIdentityRequestDto): Promise<JourneyViewModel> {
    return this.attachIdentityUseCase.execute(input)
  }

  getJourney(input: GetJourneyRequestDto): Promise<JourneyViewModel | null> {
    return this.getJourneyUseCase.execute(input)
  }

  getVisitorHistory(visitorId: string): Promise<VisitorSummaryViewModel | null> {
    return this.getVisitorHistoryUseCase.execute(visitorId)
  }

  getCustomerTimeline(customerId: string): Promise<TimelineViewModel | null> {
    return this.getCustomerTimelineUseCase.execute(customerId)
  }

  getTrafficSources(): Promise<TrafficSourceViewModel> {
    return this.getTrafficSourcesUseCase.execute()
  }

  getCampaignAttribution(): Promise<AttributionViewModel> {
    return this.getCampaignAttributionUseCase.execute()
  }

  getProductInterest(): Promise<ProductInterestViewModel> {
    return this.getProductInterestUseCase.execute()
  }
}
