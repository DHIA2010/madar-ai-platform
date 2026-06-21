import type {
  CustomerIntelligenceGateway,
  SessionViewModel,
  StartSessionRequestDto,
} from "../contracts"
import { mapSessionDtoToReadModel, mapSessionReadModelToViewModel } from "../mappers"
import { StartSessionQuery } from "../queries"
import { startSessionSchema } from "../validators"

export class StartSessionUseCase {
  private readonly query: StartSessionQuery

  constructor(gateway: CustomerIntelligenceGateway) {
    this.query = new StartSessionQuery(gateway)
  }

  async execute(input: StartSessionRequestDto): Promise<SessionViewModel> {
    const validatedInput = startSessionSchema.parse(input)
    const payload = await this.query.execute(validatedInput)
    return mapSessionReadModelToViewModel(mapSessionDtoToReadModel(payload))
  }
}
