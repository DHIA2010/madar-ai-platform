import type { AttributionGateway, ConversionViewModel } from "../contracts"
import { mapConversionAttributionsToReadModel, mapConversionReadModelToViewModel } from "../mappers"
import { GetConversionAttributionQuery } from "../queries"
import { attributionIdentitySchema } from "../validators"

export class GetConversionAttributionUseCase {
  private readonly query: GetConversionAttributionQuery

  constructor(gateway: AttributionGateway) {
    this.query = new GetConversionAttributionQuery(gateway)
  }

  async execute(journeyId: string, conversionId: string): Promise<ConversionViewModel> {
    attributionIdentitySchema.parse({ journeyId, conversionId })
    const attributions = await this.query.execute(journeyId, conversionId)
    return mapConversionReadModelToViewModel(mapConversionAttributionsToReadModel(attributions))
  }
}
