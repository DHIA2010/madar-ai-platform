import type {
  AttachIdentityRequestDto,
  CampaignAttributionDto,
  CustomerIntelligenceGateway,
  CustomerJourneyDto,
  CustomerTimelineDto,
  EndSessionRequestDto,
  GetJourneyRequestDto,
  ProductInterestDto,
  SessionDto,
  StartSessionRequestDto,
  TrackEventRequestDto,
  TrackingEventDto,
  TrafficSourceStatsDto,
  VisitorSummaryDto,
} from "../contracts"

export class StartSessionQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(input: StartSessionRequestDto): Promise<SessionDto> {
    return this.gateway.startSession(input)
  }
}

export class EndSessionQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(input: EndSessionRequestDto): Promise<SessionDto | null> {
    return this.gateway.endSession(input)
  }
}

export class TrackEventQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(input: TrackEventRequestDto): Promise<TrackingEventDto> {
    return this.gateway.trackEvent(input)
  }
}

export class AttachIdentityQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(input: AttachIdentityRequestDto): Promise<CustomerJourneyDto> {
    return this.gateway.attachIdentity(input)
  }
}

export class GetJourneyQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(input: GetJourneyRequestDto): Promise<CustomerJourneyDto | null> {
    return this.gateway.getJourney(input)
  }
}

export class GetVisitorHistoryQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(visitorId: string): Promise<VisitorSummaryDto | null> {
    return this.gateway.getVisitorHistory(visitorId)
  }
}

export class GetCustomerTimelineQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(customerId: string): Promise<CustomerTimelineDto | null> {
    return this.gateway.getCustomerTimeline(customerId)
  }
}

export class GetTrafficSourcesQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(): Promise<TrafficSourceStatsDto[]> {
    return this.gateway.getTrafficSources()
  }
}

export class GetCampaignAttributionQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(): Promise<CampaignAttributionDto[]> {
    return this.gateway.getCampaignAttribution()
  }
}

export class GetProductInterestQuery {
  constructor(private readonly gateway: CustomerIntelligenceGateway) {}

  execute(): Promise<ProductInterestDto[]> {
    return this.gateway.getProductInterest()
  }
}
