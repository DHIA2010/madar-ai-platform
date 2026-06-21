import type { IntegrationGateway, RunSyncRequestDto, SyncStatusViewModel } from "../contracts"
import { mapSyncRunToReadModel, mapSyncStatusReadModelToViewModel } from "../mappers"
import { RunSyncQuery } from "../queries"
import { runSyncSchema } from "../validators"

export class RunSyncUseCase {
  private readonly query: RunSyncQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new RunSyncQuery(gateway)
  }

  async execute(input: RunSyncRequestDto): Promise<SyncStatusViewModel> {
    const validated = runSyncSchema.parse(input)
    const result = await this.query.execute(validated)
    return mapSyncStatusReadModelToViewModel(mapSyncRunToReadModel(result))
  }
}
