import type {
  AudienceViewModel,
  EvaluateSegmentRequestDto,
  SegmentationGateway,
} from "../contracts"
import { mapAudienceDtoToReadModel, mapAudienceReadModelToViewModel } from "../mappers"
import { EvaluateAudienceQuery, EvaluateSegmentQuery } from "../queries"
import { evaluateSegmentSchema } from "../validators"

export class EvaluateSegmentUseCase {
  private readonly evaluateSegmentQuery: EvaluateSegmentQuery
  private readonly evaluateAudienceQuery: EvaluateAudienceQuery

  constructor(gateway: SegmentationGateway) {
    this.evaluateSegmentQuery = new EvaluateSegmentQuery(gateway)
    this.evaluateAudienceQuery = new EvaluateAudienceQuery(gateway)
  }

  async execute(input: EvaluateSegmentRequestDto): Promise<AudienceViewModel> {
    const validatedInput = evaluateSegmentSchema.parse(input)
    await this.evaluateSegmentQuery.execute(validatedInput)
    const audience = await this.evaluateAudienceQuery.execute(validatedInput.segmentId)
    return mapAudienceReadModelToViewModel(mapAudienceDtoToReadModel(audience))
  }
}
