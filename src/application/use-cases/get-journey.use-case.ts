import type {
  CustomerIntelligenceGateway,
  GetJourneyRequestDto,
  JourneyViewModel,
} from "../contracts"
import { mapJourneyDtoToReadModel, mapJourneyReadModelToViewModel } from "../mappers"
import { GetJourneyQuery } from "../queries"
import { getJourneySchema } from "../validators"

export class GetJourneyUseCase {
  private readonly query: GetJourneyQuery

  constructor(gateway: CustomerIntelligenceGateway) {
    this.query = new GetJourneyQuery(gateway)
  }

  async execute(input: GetJourneyRequestDto): Promise<JourneyViewModel | null> {
    const validatedInput = getJourneySchema.parse(input)
    const payload = await this.query.execute(validatedInput)

    if (!payload) {
      return null
    }

    return mapJourneyReadModelToViewModel(mapJourneyDtoToReadModel(payload))
  }
}
