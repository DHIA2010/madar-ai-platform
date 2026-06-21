import type { IntegrationGateway, RetrySyncRequestDto, SyncStatusViewModel } from "../contracts"
import { mapSyncRunToReadModel, mapSyncStatusReadModelToViewModel } from "../mappers"
import { RetrySyncQuery } from "../queries"
import { retrySyncSchema } from "../validators"

export class RetrySyncUseCase {
  private readonly query: RetrySyncQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new RetrySyncQuery(gateway)
  }

  async execute(input: RetrySyncRequestDto): Promise<SyncStatusViewModel> {
    const validated = retrySyncSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapSyncStatusReadModelToViewModel(mapSyncRunToReadModel(result))
  }
}
