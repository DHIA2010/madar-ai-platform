import type {
  AudienceViewModel,
  EvaluateSegmentRequestDto,
  SegmentationGateway,
} from "../contracts"
import { mapAudienceDtoToReadModel, mapAudienceReadModelToViewModel } from "../mappers"
import { EvaluateAudienceQuery } from "../queries"
import { segmentIdSchema } from "../validators"

export class EvaluateAudienceUseCase {
  private readonly query: EvaluateAudienceQuery

  constructor(gateway: SegmentationGateway) {
    this.query = new EvaluateAudienceQuery(gateway)
  }

  async execute(
    segmentId: string,
    mode?: EvaluateSegmentRequestDto["mode"]
  ): Promise<AudienceViewModel> {
    segmentIdSchema.parse({ segmentId })
    const audience = await this.query.execute(segmentId, mode)
    return mapAudienceReadModelToViewModel(mapAudienceDtoToReadModel(audience))
  }
}
