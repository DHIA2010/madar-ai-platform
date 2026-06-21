import type {
  ConnectionViewModel,
  IntegrationGateway,
  RefreshConnectionRequestDto,
} from "../contracts"
import { mapConnectionReadModelToViewModel, mapConnectionToReadModel } from "../mappers"
import { RefreshConnectionQuery } from "../queries"
import { refreshConnectionSchema } from "../validators"

export class RefreshConnectionUseCase {
  private readonly query: RefreshConnectionQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new RefreshConnectionQuery(gateway)
  }

  async execute(input: RefreshConnectionRequestDto): Promise<ConnectionViewModel> {
    const validated = refreshConnectionSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapConnectionReadModelToViewModel(mapConnectionToReadModel(result))
  }
}
