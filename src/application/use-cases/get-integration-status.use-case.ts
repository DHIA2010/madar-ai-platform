import type {
  GetIntegrationStatusRequestDto,
  IntegrationGateway,
  IntegrationViewModel,
} from "../contracts"
import { mapIntegrationReadModelToViewModel, mapIntegrationStatusToReadModel } from "../mappers"
import { GetIntegrationStatusQuery } from "../queries"
import { getIntegrationStatusSchema } from "../validators"

export class GetIntegrationStatusUseCase {
  private readonly query: GetIntegrationStatusQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new GetIntegrationStatusQuery(gateway)
  }

  async execute(input: GetIntegrationStatusRequestDto): Promise<IntegrationViewModel> {
    const validated = getIntegrationStatusSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapIntegrationReadModelToViewModel(mapIntegrationStatusToReadModel(result))
  }
}
