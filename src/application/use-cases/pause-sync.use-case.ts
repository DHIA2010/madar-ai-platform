import type { IntegrationGateway, PauseSyncRequestDto } from "../contracts"
import { PauseSyncQuery } from "../queries"
import { pauseSyncSchema } from "../validators"

export class PauseSyncUseCase {
  private readonly query: PauseSyncQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new PauseSyncQuery(gateway)
  }

  async execute(input: PauseSyncRequestDto) {
    const validated = pauseSyncSchema.parse(input)
    return this.query.execute(validated)
  }
}
