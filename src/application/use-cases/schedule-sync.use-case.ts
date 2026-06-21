import type { IntegrationGateway, ScheduleSyncRequestDto } from "../contracts"
import { ScheduleSyncQuery } from "../queries"
import { scheduleSyncSchema } from "../validators"

export class ScheduleSyncUseCase {
  private readonly query: ScheduleSyncQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new ScheduleSyncQuery(gateway)
  }

  execute(input: ScheduleSyncRequestDto) {
    const validated = scheduleSyncSchema.parse(input)
    return this.query.execute(validated)
  }
}
