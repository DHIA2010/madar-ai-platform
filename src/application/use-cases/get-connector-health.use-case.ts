import type {
  ConnectorHealthViewModel,
  GetConnectorHealthRequestDto,
  IntegrationGateway,
} from "../contracts"
import { mapConnectorHealthReadModelToViewModel, mapConnectorHealthToReadModel } from "../mappers"
import { GetConnectorHealthQuery } from "../queries"
import { getConnectorHealthSchema } from "../validators"

export class GetConnectorHealthUseCase {
  private readonly query: GetConnectorHealthQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new GetConnectorHealthQuery(gateway)
  }

  async execute(input: GetConnectorHealthRequestDto): Promise<ConnectorHealthViewModel> {
    const validated = getConnectorHealthSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapConnectorHealthReadModelToViewModel(mapConnectorHealthToReadModel(result))
  }
}
