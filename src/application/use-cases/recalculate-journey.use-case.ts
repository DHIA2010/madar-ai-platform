import type {
  AttributionComparisonViewModel,
  AttributionGateway,
  RecalculateJourneyRequestDto,
} from "../contracts"
import {
  mapAttributionComparisonReadModelToViewModel,
  mapAttributionComparisonToReadModel,
} from "../mappers"
import { RecalculateJourneyQuery } from "../queries"
import { recalculateJourneySchema } from "../validators"

export class RecalculateJourneyUseCase {
  private readonly query: RecalculateJourneyQuery

  constructor(gateway: AttributionGateway) {
    this.query = new RecalculateJourneyQuery(gateway)
  }

  async execute(input: RecalculateJourneyRequestDto): Promise<AttributionComparisonViewModel> {
    const validated = recalculateJourneySchema.parse(input)
    const result = await this.query.execute(validated)
    return mapAttributionComparisonReadModelToViewModel(mapAttributionComparisonToReadModel(result))
  }
}
