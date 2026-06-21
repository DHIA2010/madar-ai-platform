import type {
  CampaignDetailsViewModel,
  CampaignGateway,
  CampaignListQueryDto,
  CampaignListViewModel,
  CreateCampaignRequestDto,
  UpdateCampaignRequestDto,
} from "../contracts"
import {
  CreateCampaignUseCase,
  GetCampaignDetailsUseCase,
  GetCampaignListUseCase,
  UpdateCampaignUseCase,
} from "../use-cases"

export class CampaignApplicationService {
  private readonly getCampaignListUseCase: GetCampaignListUseCase
  private readonly getCampaignDetailsUseCase: GetCampaignDetailsUseCase
  private readonly createCampaignUseCase: CreateCampaignUseCase
  private readonly updateCampaignUseCase: UpdateCampaignUseCase

  constructor(gateway: CampaignGateway) {
    this.getCampaignListUseCase = new GetCampaignListUseCase(gateway)
    this.getCampaignDetailsUseCase = new GetCampaignDetailsUseCase(gateway)
    this.createCampaignUseCase = new CreateCampaignUseCase(gateway)
    this.updateCampaignUseCase = new UpdateCampaignUseCase(gateway)
  }

  getCampaignList(input: CampaignListQueryDto): Promise<CampaignListViewModel> {
    return this.getCampaignListUseCase.execute(input)
  }

  getCampaignDetails(campaignId: string): Promise<CampaignDetailsViewModel> {
    return this.getCampaignDetailsUseCase.execute(campaignId)
  }

  createCampaign(payload: CreateCampaignRequestDto): Promise<CampaignDetailsViewModel> {
    return this.createCampaignUseCase.execute(payload)
  }

  updateCampaign(
    campaignId: string,
    payload: UpdateCampaignRequestDto
  ): Promise<CampaignDetailsViewModel> {
    return this.updateCampaignUseCase.execute(campaignId, payload)
  }
}
