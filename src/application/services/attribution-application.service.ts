import type {
  AttributionComparisonViewModel,
  AttributionGateway,
  CampaignPerformanceViewModel,
  CalculateAttributionRequestDto,
  ChannelPerformanceViewModel,
  ConversionViewModel,
  JourneyAttributionViewModel,
  PreviewAttributionRequestDto,
  RecalculateJourneyRequestDto,
  ROASViewModel,
  ROIViewModel,
  Touchpoint,
} from "../contracts"
import {
  CalculateAttributionUseCase,
  CompareAttributionModelsUseCase,
  GetCampaignROIUseCase,
  GetCampaignROASUseCase,
  GetChannelPerformanceUseCase,
  GetConversionAttributionUseCase,
  GetJourneyTouchpointsUseCase,
  PreviewAttributionUseCase,
  RecalculateJourneyUseCase,
} from "../use-cases"

export class AttributionApplicationService {
  private readonly calculateAttributionUseCase: CalculateAttributionUseCase
  private readonly recalculateJourneyUseCase: RecalculateJourneyUseCase
  private readonly getJourneyTouchpointsUseCase: GetJourneyTouchpointsUseCase
  private readonly getConversionAttributionUseCase: GetConversionAttributionUseCase
  private readonly getCampaignROIUseCase: GetCampaignROIUseCase
  private readonly getCampaignROASUseCase: GetCampaignROASUseCase
  private readonly getChannelPerformanceUseCase: GetChannelPerformanceUseCase
  private readonly compareAttributionModelsUseCase: CompareAttributionModelsUseCase
  private readonly previewAttributionUseCase: PreviewAttributionUseCase

  constructor(gateway: AttributionGateway) {
    this.calculateAttributionUseCase = new CalculateAttributionUseCase(gateway)
    this.recalculateJourneyUseCase = new RecalculateJourneyUseCase(gateway)
    this.getJourneyTouchpointsUseCase = new GetJourneyTouchpointsUseCase(gateway)
    this.getConversionAttributionUseCase = new GetConversionAttributionUseCase(gateway)
    this.getCampaignROIUseCase = new GetCampaignROIUseCase(gateway)
    this.getCampaignROASUseCase = new GetCampaignROASUseCase(gateway)
    this.getChannelPerformanceUseCase = new GetChannelPerformanceUseCase(gateway)
    this.compareAttributionModelsUseCase = new CompareAttributionModelsUseCase(gateway)
    this.previewAttributionUseCase = new PreviewAttributionUseCase(gateway)
  }

  calculateAttribution(
    input: CalculateAttributionRequestDto
  ): Promise<JourneyAttributionViewModel> {
    return this.calculateAttributionUseCase.execute(input)
  }

  recalculateJourney(input: RecalculateJourneyRequestDto): Promise<AttributionComparisonViewModel> {
    return this.recalculateJourneyUseCase.execute(input)
  }

  getJourneyTouchpoints(journeyId: string): Promise<Touchpoint[]> {
    return this.getJourneyTouchpointsUseCase.execute(journeyId)
  }

  getConversionAttribution(journeyId: string, conversionId: string): Promise<ConversionViewModel> {
    return this.getConversionAttributionUseCase.execute(journeyId, conversionId)
  }

  getCampaignROI(campaignId: string): Promise<ROIViewModel | null> {
    return this.getCampaignROIUseCase.execute(campaignId)
  }

  getCampaignROAS(campaignId: string): Promise<ROASViewModel | null> {
    return this.getCampaignROASUseCase.execute(campaignId)
  }

  getChannelPerformance(): Promise<ChannelPerformanceViewModel> {
    return this.getChannelPerformanceUseCase.execute()
  }

  compareAttributionModels(
    input: RecalculateJourneyRequestDto
  ): Promise<AttributionComparisonViewModel> {
    return this.compareAttributionModelsUseCase.execute(input)
  }

  previewAttribution(input: PreviewAttributionRequestDto): Promise<JourneyAttributionViewModel> {
    return this.previewAttributionUseCase.execute(input)
  }

  getCampaignPerformance(): Promise<CampaignPerformanceViewModel> {
    return this.getChannelPerformanceUseCase.executeCampaignPerformance()
  }
}
