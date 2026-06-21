import type { CampaignGateway, CampaignListViewModel, CampaignListQueryDto } from "../contracts"
import { mapCampaignListDtoToReadModel, mapCampaignListReadModelToViewModel } from "../mappers"
import { GetCampaignsQuery } from "../queries"
import { campaignListQuerySchema } from "../validators"

export class GetCampaignListUseCase {
  private readonly query: GetCampaignsQuery

  constructor(gateway: CampaignGateway) {
    this.query = new GetCampaignsQuery(gateway)
  }

  async execute(input: CampaignListQueryDto): Promise<CampaignListViewModel> {
    const validatedInput = campaignListQuerySchema.parse(input)
    const payload = await this.query.execute(validatedInput)
    return mapCampaignListReadModelToViewModel(mapCampaignListDtoToReadModel(payload))
  }
}
