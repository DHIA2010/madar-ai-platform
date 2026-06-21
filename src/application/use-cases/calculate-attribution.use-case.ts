import type {
  CalculateAttributionRequestDto,
  AttributionGateway,
  JourneyAttributionViewModel,
} from "../contracts"
import {
  mapJourneyAttributionReadModelToViewModel,
  mapJourneyAttributionToReadModel,
} from "../mappers"
import { CalculateAttributionQuery } from "../queries"
import { calculateAttributionSchema } from "../validators"

export class CalculateAttributionUseCase {
  private readonly query: CalculateAttributionQuery

  constructor(gateway: AttributionGateway) {
    this.query = new CalculateAttributionQuery(gateway)
  }

  async execute(input: CalculateAttributionRequestDto): Promise<JourneyAttributionViewModel> {
    const validated = calculateAttributionSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapJourneyAttributionReadModelToViewModel(mapJourneyAttributionToReadModel(result))
  }
}
