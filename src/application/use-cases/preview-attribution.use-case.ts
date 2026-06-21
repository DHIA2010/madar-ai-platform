import type {
  AttributionGateway,
  JourneyAttributionViewModel,
  PreviewAttributionRequestDto,
} from "../contracts"
import {
  mapJourneyAttributionReadModelToViewModel,
  mapJourneyAttributionToReadModel,
} from "../mappers"
import { PreviewAttributionQuery } from "../queries"
import { previewAttributionSchema } from "../validators"

export class PreviewAttributionUseCase {
  private readonly query: PreviewAttributionQuery

  constructor(gateway: AttributionGateway) {
    this.query = new PreviewAttributionQuery(gateway)
  }

  async execute(input: PreviewAttributionRequestDto): Promise<JourneyAttributionViewModel> {
    const validated = previewAttributionSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapJourneyAttributionReadModelToViewModel(mapJourneyAttributionToReadModel(result))
  }
}
