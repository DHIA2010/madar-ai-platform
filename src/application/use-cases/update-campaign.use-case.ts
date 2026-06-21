import type {
  CampaignDetailsViewModel,
  CampaignGateway,
  UpdateCampaignRequestDto,
} from "../contracts"
import {
  mapCampaignDetailsDtoToReadModel,
  mapCampaignDetailsReadModelToViewModel,
} from "../mappers"
import { campaignIdSchema, campaignMutationSchema } from "../validators"

export class UpdateCampaignUseCase {
  constructor(private readonly gateway: CampaignGateway) {}

  async execute(
    campaignId: string,
    payload: UpdateCampaignRequestDto
  ): Promise<CampaignDetailsViewModel> {
    const validatedCampaignId = campaignIdSchema.parse({ campaignId })
    const validatedPayload = campaignMutationSchema.parse(payload)
    const updated = await this.gateway.updateCampaign(
      validatedCampaignId.campaignId,
      validatedPayload
    )
    return mapCampaignDetailsReadModelToViewModel(mapCampaignDetailsDtoToReadModel(updated))
  }
}
