import type {
  GetSyncHistoryRequestDto,
  IntegrationGateway,
  SyncHistoryViewModel,
} from "../contracts"
import { mapSyncHistoryReadModelToViewModel, mapSyncHistoryToReadModel } from "../mappers"
import { GetSyncHistoryQuery } from "../queries"
import { getSyncHistorySchema } from "../validators"

export class GetSyncHistoryUseCase {
  private readonly query: GetSyncHistoryQuery

  constructor(gateway: IntegrationGateway) {
    this.query = new GetSyncHistoryQuery(gateway)
  }

  async execute(input: GetSyncHistoryRequestDto): Promise<SyncHistoryViewModel> {
    const validated = getSyncHistorySchema.parse(input)
    const result = await this.query.execute(validated)
    return mapSyncHistoryReadModelToViewModel(mapSyncHistoryToReadModel(result))
  }
}
