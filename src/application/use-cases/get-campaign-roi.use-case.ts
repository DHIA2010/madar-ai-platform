import type { AttributionGateway, ROIViewModel } from "../contracts"
import { mapRoiReadModelToViewModel, mapRoiToReadModel } from "../mappers"
import { GetCampaignRoiQuery } from "../queries"
import { attributionCampaignIdSchema } from "../validators"

export class GetCampaignROIUseCase {
  private readonly query: GetCampaignRoiQuery

  constructor(gateway: AttributionGateway) {
    this.query = new GetCampaignRoiQuery(gateway)
  }

  async execute(campaignId: string): Promise<ROIViewModel | null> {
    attributionCampaignIdSchema.parse({ campaignId })
    const roi = await this.query.execute(campaignId)
    if (!roi) {
      return null
    }
    return mapRoiReadModelToViewModel(mapRoiToReadModel(roi))
  }
}
