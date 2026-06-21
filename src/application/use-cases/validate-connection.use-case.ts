import type {
  ConnectionViewModel,
  IntegrationGateway,
  ValidateConnectionRequestDto,
} from "../contracts"
import { mapConnectionReadModelToViewModel, mapConnectionToReadModel } from "../mappers"
import { ValidateConnectionQuery } from "../queries"
import { validateConnectionSchema } from "../validators"

export class ValidateConnectionUseCase {
  private readonly query: ValidateConnectionQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new ValidateConnectionQuery(gateway)
  }

  async execute(input: ValidateConnectionRequestDto): Promise<ConnectionViewModel> {
    const validated = validateConnectionSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapConnectionReadModelToViewModel(mapConnectionToReadModel(result))
  }
}
