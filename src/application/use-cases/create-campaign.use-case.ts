import type {
  CampaignDetailsViewModel,
  CampaignGateway,
  CreateCampaignRequestDto,
} from "../contracts"
import {
  mapCampaignDetailsDtoToReadModel,
  mapCampaignDetailsReadModelToViewModel,
} from "../mappers"
import { campaignMutationSchema } from "../validators"

export class CreateCampaignUseCase {
  constructor(private readonly gateway: CampaignGateway) {}

  async execute(payload: CreateCampaignRequestDto): Promise<CampaignDetailsViewModel> {
    const validatedPayload = campaignMutationSchema.parse(payload)
    const created = await this.gateway.createCampaign(validatedPayload)
    return mapCampaignDetailsReadModelToViewModel(mapCampaignDetailsDtoToReadModel(created))
  }
}
