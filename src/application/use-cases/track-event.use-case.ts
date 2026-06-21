import type {
  CustomerIntelligenceGateway,
  TrackEventRequestDto,
  VisitorSummaryViewModel,
} from "../contracts"
import { mapVisitorSummaryDtoToReadModel, mapVisitorSummaryReadModelToViewModel } from "../mappers"
import { TrackEventQuery } from "../queries"
import { trackEventSchema } from "../validators"

export class TrackEventUseCase {
  private readonly query: TrackEventQuery
  private readonly gateway: CustomerIntelligenceGateway

  constructor(gateway: CustomerIntelligenceGateway) {
    this.gateway = gateway
    this.query = new TrackEventQuery(gateway)
  }

  async execute(input: TrackEventRequestDto): Promise<VisitorSummaryViewModel> {
    const validatedInput = trackEventSchema.parse(input)
    const tracked = await this.query.execute(validatedInput)
    const history = await this.gateway.getVisitorHistory(tracked.visitorId)

    if (!history) {
      throw new Error(`Visitor history was not found for visitor ${tracked.visitorId}.`)
    }

    return mapVisitorSummaryReadModelToViewModel(mapVisitorSummaryDtoToReadModel(history))
  }
}
