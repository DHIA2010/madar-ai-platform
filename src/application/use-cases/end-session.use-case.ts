import type {
  CustomerIntelligenceGateway,
  EndSessionRequestDto,
  SessionViewModel,
} from "../contracts"
import { mapSessionDtoToReadModel, mapSessionReadModelToViewModel } from "../mappers"
import { EndSessionQuery } from "../queries"
import { endSessionSchema } from "../validators"

export class EndSessionUseCase {
  private readonly query: EndSessionQuery

  constructor(gateway: CustomerIntelligenceGateway) {
    this.query = new EndSessionQuery(gateway)
  }

  async execute(input: EndSessionRequestDto): Promise<SessionViewModel | null> {
    const validatedInput = endSessionSchema.parse(input)
    const payload = await this.query.execute(validatedInput)

    if (!payload) {
      return null
    }

    return mapSessionReadModelToViewModel(mapSessionDtoToReadModel(payload))
  }
}
