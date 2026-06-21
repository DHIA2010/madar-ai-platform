import type { CustomerIntelligenceGateway, TimelineViewModel } from "../contracts"
import { mapTimelineDtoToReadModel, mapTimelineReadModelToViewModel } from "../mappers"
import { GetCustomerTimelineQuery } from "../queries"
import { customerIdSchema } from "../validators"

export class GetCustomerTimelineUseCase {
  private readonly query: GetCustomerTimelineQuery

  constructor(gateway: CustomerIntelligenceGateway) {
    this.query = new GetCustomerTimelineQuery(gateway)
  }

  async execute(customerId: string): Promise<TimelineViewModel | null> {
    customerIdSchema.parse({ customerId })
    const payload = await this.query.execute(customerId)

    if (!payload) {
      return null
    }

    return mapTimelineReadModelToViewModel(mapTimelineDtoToReadModel(payload))
  }
}
