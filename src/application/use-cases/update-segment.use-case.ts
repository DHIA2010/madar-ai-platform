import type {
  SegmentSummaryViewModel,
  SegmentationGateway,
  UpdateSegmentRequestDto,
} from "../contracts"
import { mapSegmentSummaryDtoToReadModel, mapSegmentSummaryReadModelToViewModel } from "../mappers"
import { UpdateSegmentQuery } from "../queries"
import { segmentIdSchema, updateSegmentSchema } from "../validators"

export class UpdateSegmentUseCase {
  private readonly query: UpdateSegmentQuery

  constructor(gateway: SegmentationGateway) {
    this.query = new UpdateSegmentQuery(gateway)
  }

  async execute(
    segmentId: string,
    input: UpdateSegmentRequestDto
  ): Promise<SegmentSummaryViewModel | null> {
    segmentIdSchema.parse({ segmentId })
    const validatedInput = updateSegmentSchema.parse(input)
    const segment = await this.query.execute(segmentId, validatedInput)

    if (!segment) {
      return null
    }

    return mapSegmentSummaryReadModelToViewModel(
      mapSegmentSummaryDtoToReadModel({
        segment,
        totalMembers: 0,
      })
    )
  }
}
