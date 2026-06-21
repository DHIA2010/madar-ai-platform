import type {
  AuthorizeConnectorRequestDto,
  ConnectionViewModel,
  IntegrationGateway,
} from "../contracts"
import { mapConnectionReadModelToViewModel, mapConnectionToReadModel } from "../mappers"
import { AuthorizeConnectorQuery } from "../queries"
import { authorizeConnectorSchema } from "../validators"

export class AuthorizeConnectorUseCase {
  private readonly query: AuthorizeConnectorQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new AuthorizeConnectorQuery(gateway)
  }

  async execute(input: AuthorizeConnectorRequestDto): Promise<ConnectionViewModel> {
    const validated = authorizeConnectorSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapConnectionReadModelToViewModel(mapConnectionToReadModel(result))
  }
}
