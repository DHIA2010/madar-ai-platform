import type { CustomerIntelligenceGateway, ProductInterestViewModel } from "../contracts"
import {
  mapProductInterestDtoToReadModel,
  mapProductInterestReadModelToViewModel,
} from "../mappers"
import { GetProductInterestQuery } from "../queries"

export class GetProductInterestUseCase {
  private readonly query: GetProductInterestQuery

  constructor(gateway: CustomerIntelligenceGateway) {
    this.query = new GetProductInterestQuery(gateway)
  }

  async execute(): Promise<ProductInterestViewModel> {
    const payload = await this.query.execute()
    return mapProductInterestReadModelToViewModel(mapProductInterestDtoToReadModel(payload))
  }
}
