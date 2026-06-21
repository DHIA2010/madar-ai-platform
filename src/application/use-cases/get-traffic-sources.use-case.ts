import type { CustomerIntelligenceGateway, TrafficSourceViewModel } from "../contracts"
import { mapTrafficSourcesDtoToReadModel, mapTrafficSourcesReadModelToViewModel } from "../mappers"
import { GetTrafficSourcesQuery } from "../queries"

export class GetTrafficSourcesUseCase {
  private readonly query: GetTrafficSourcesQuery

  constructor(gateway: CustomerIntelligenceGateway) {
    this.query = new GetTrafficSourcesQuery(gateway)
  }

  async execute(): Promise<TrafficSourceViewModel> {
    const payload = await this.query.execute()
    return mapTrafficSourcesReadModelToViewModel(mapTrafficSourcesDtoToReadModel(payload))
  }
}
