import type {
  AttributionComparison,
  AttributionGateway,
  AttributionResult,
  CalculateAttributionRequestDto,
  ChannelPerformance,
  PreviewAttributionRequestDto,
  RecalculateJourneyRequestDto,
  RoasMetrics,
  RoiMetrics,
  Touchpoint,
} from "../contracts"

export class CalculateAttributionQuery {
  constructor(private readonly gateway: AttributionGateway) {}

  execute(input: CalculateAttributionRequestDto): Promise<AttributionResult> {
    return this.gateway.calculateAttribution(input)
  }
}

export class RecalculateJourneyQuery {
  constructor(private readonly gateway: AttributionGateway) {}

  execute(input: RecalculateJourneyRequestDto): Promise<AttributionComparison> {
    return this.gateway.recalculateJourney(input)
  }
}

export class GetJourneyTouchpointsQuery {
  constructor(private readonly gateway: AttributionGateway) {}

  execute(journeyId: string): Promise<Touchpoint[]> {
    return this.gateway.getJourneyTouchpoints(journeyId)
  }
}

export class GetConversionAttributionQuery {
  constructor(private readonly gateway: AttributionGateway) {}

  execute(journeyId: string, conversionId: string): Promise<AttributionResult[]> {
    return this.gateway.getConversionAttribution(journeyId, conversionId)
  }
}

export class GetCampaignRoiQuery {
  constructor(private readonly gateway: AttributionGateway) {}

  execute(campaignId: string): Promise<RoiMetrics | null> {
    return this.gateway.getCampaignROI(campaignId)
  }
}

export class GetCampaignRoasQuery {
  constructor(private readonly gateway: AttributionGateway) {}

  execute(campaignId: string): Promise<RoasMetrics | null> {
    return this.gateway.getCampaignROAS(campaignId)
  }
}

export class GetChannelPerformanceQuery {
  constructor(private readonly gateway: AttributionGateway) {}

  execute(): Promise<ChannelPerformance[]> {
    return this.gateway.getChannelPerformance()
  }
}

export class CompareAttributionModelsQuery {
  constructor(private readonly gateway: AttributionGateway) {}

  execute(input: RecalculateJourneyRequestDto): Promise<AttributionComparison> {
    return this.gateway.compareAttributionModels(input)
  }
}

export class PreviewAttributionQuery {
  constructor(private readonly gateway: AttributionGateway) {}

  execute(input: PreviewAttributionRequestDto): Promise<AttributionResult> {
    return this.gateway.previewAttribution(input)
  }
}
