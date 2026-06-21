import type { AttributionGateway, ROASViewModel } from "../contracts"
import { mapRoasReadModelToViewModel, mapRoasToReadModel } from "../mappers"
import { GetCampaignRoasQuery } from "../queries"
import { attributionCampaignIdSchema } from "../validators"

export class GetCampaignROASUseCase {
  private readonly query: GetCampaignRoasQuery

  constructor(gateway: AttributionGateway) {
    this.query = new GetCampaignRoasQuery(gateway)
  }

  async execute(campaignId: string): Promise<ROASViewModel | null> {
    attributionCampaignIdSchema.parse({ campaignId })
    const roas = await this.query.execute(campaignId)
    if (!roas) {
      return null
    }
    return mapRoasReadModelToViewModel(mapRoasToReadModel(roas))
  }
}
