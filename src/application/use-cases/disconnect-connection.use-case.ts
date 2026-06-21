import type {
  ConnectionViewModel,
  DisconnectConnectionRequestDto,
  IntegrationGateway,
} from "../contracts"
import { mapConnectionReadModelToViewModel, mapConnectionToReadModel } from "../mappers"
import { DisconnectConnectionQuery } from "../queries"
import { disconnectConnectionSchema } from "../validators"

export class DisconnectConnectionUseCase {
  private readonly query: DisconnectConnectionQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new DisconnectConnectionQuery(gateway)
  }

  async execute(input: DisconnectConnectionRequestDto): Promise<ConnectionViewModel> {
    const validated = disconnectConnectionSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapConnectionReadModelToViewModel(mapConnectionToReadModel(result))
  }
}
