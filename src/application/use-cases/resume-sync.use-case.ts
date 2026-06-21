import type { IntegrationGateway, ResumeSyncRequestDto } from "../contracts"
import { ResumeSyncQuery } from "../queries"
import { resumeSyncSchema } from "../validators"

export class ResumeSyncUseCase {
  private readonly query: ResumeSyncQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new ResumeSyncQuery(gateway)
  }

  async execute(input: ResumeSyncRequestDto) {
    const validated = resumeSyncSchema.parse(input)
    return this.query.execute(validated)
  }
}
