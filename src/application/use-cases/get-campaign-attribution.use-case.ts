import type { AttributionViewModel, CustomerIntelligenceGateway } from "../contracts"
import {
  mapCampaignAttributionDtoToReadModel,
  mapCampaignAttributionReadModelToViewModel,
} from "../mappers"
import { GetCampaignAttributionQuery } from "../queries"

export class GetCampaignAttributionUseCase {
  private readonly query: GetCampaignAttributionQuery

  constructor(gateway: CustomerIntelligenceGateway) {
    this.query = new GetCampaignAttributionQuery(gateway)
  }

  async execute(): Promise<AttributionViewModel> {
    const payload = await this.query.execute()
    return mapCampaignAttributionReadModelToViewModel(mapCampaignAttributionDtoToReadModel(payload))
  }
}
