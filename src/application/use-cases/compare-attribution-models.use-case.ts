import type {
  AttributionComparisonViewModel,
  AttributionGateway,
  RecalculateJourneyRequestDto,
} from "../contracts"
import {
  mapAttributionComparisonReadModelToViewModel,
  mapAttributionComparisonToReadModel,
} from "../mappers"
import { CompareAttributionModelsQuery } from "../queries"
import { recalculateJourneySchema } from "../validators"

export class CompareAttributionModelsUseCase {
  private readonly query: CompareAttributionModelsQuery

  constructor(gateway: AttributionGateway) {
    this.query = new CompareAttributionModelsQuery(gateway)
  }

  async execute(input: RecalculateJourneyRequestDto): Promise<AttributionComparisonViewModel> {
    const validated = recalculateJourneySchema.parse(input)
    const comparison = await this.query.execute(validated)
    return mapAttributionComparisonReadModelToViewModel(
      mapAttributionComparisonToReadModel(comparison)
    )
  }
}
