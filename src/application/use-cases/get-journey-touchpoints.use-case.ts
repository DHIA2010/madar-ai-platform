import type { AttributionGateway, Touchpoint } from "../contracts"
import { GetJourneyTouchpointsQuery } from "../queries"
import { attributionIdentitySchema } from "../validators"

export class GetJourneyTouchpointsUseCase {
  private readonly query: GetJourneyTouchpointsQuery

  constructor(gateway: AttributionGateway) {
    this.query = new GetJourneyTouchpointsQuery(gateway)
  }

  async execute(journeyId: string): Promise<Touchpoint[]> {
    attributionIdentitySchema.parse({ journeyId, conversionId: "touchpoints" })
    return this.query.execute(journeyId)
  }
}
