import type { CampaignDetailsViewModel, CampaignGateway } from "../contracts"
import { ReadModelNotFoundError } from "../errors"
import {
  mapCampaignDetailsDtoToReadModel,
  mapCampaignDetailsReadModelToViewModel,
} from "../mappers"
import { GetCampaignDetailsQuery } from "../queries"
import { campaignIdSchema } from "../validators"

export class GetCampaignDetailsUseCase {
  private readonly query: GetCampaignDetailsQuery

  constructor(gateway: CampaignGateway) {
    this.query = new GetCampaignDetailsQuery(gateway)
  }

  async execute(campaignId: string): Promise<CampaignDetailsViewModel> {
    const validatedInput = campaignIdSchema.parse({ campaignId })
    const payload = await this.query.execute(validatedInput.campaignId)

    if (!payload) {
      throw new ReadModelNotFoundError(validatedInput.campaignId)
    }

    return mapCampaignDetailsReadModelToViewModel(mapCampaignDetailsDtoToReadModel(payload))
  }
}
