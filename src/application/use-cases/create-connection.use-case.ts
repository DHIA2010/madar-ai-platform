import type {
  ConnectionViewModel,
  CreateConnectionRequestDto,
  IntegrationGateway,
} from "../contracts"
import { mapConnectionReadModelToViewModel, mapConnectionToReadModel } from "../mappers"
import { CreateConnectionQuery } from "../queries"
import { createConnectionSchema } from "../validators"

export class CreateConnectionUseCase {
  private readonly query: CreateConnectionQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new CreateConnectionQuery(gateway)
  }

  async execute(input: CreateConnectionRequestDto): Promise<ConnectionViewModel> {
    const validated = createConnectionSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapConnectionReadModelToViewModel(mapConnectionToReadModel(result))
  }
}
