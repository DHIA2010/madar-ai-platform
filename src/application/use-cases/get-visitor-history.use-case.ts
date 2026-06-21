import type { CustomerIntelligenceGateway, VisitorSummaryViewModel } from "../contracts"
import { mapVisitorSummaryDtoToReadModel, mapVisitorSummaryReadModelToViewModel } from "../mappers"
import { GetVisitorHistoryQuery } from "../queries"
import { visitorIdSchema } from "../validators"

export class GetVisitorHistoryUseCase {
  private readonly query: GetVisitorHistoryQuery

  constructor(gateway: CustomerIntelligenceGateway) {
    this.query = new GetVisitorHistoryQuery(gateway)
  }

  async execute(visitorId: string): Promise<VisitorSummaryViewModel | null> {
    visitorIdSchema.parse({ visitorId })
    const payload = await this.query.execute(visitorId)

    if (!payload) {
      return null
    }

    return mapVisitorSummaryReadModelToViewModel(mapVisitorSummaryDtoToReadModel(payload))
  }
}
