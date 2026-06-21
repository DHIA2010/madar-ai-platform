import type { SegmentSummaryViewModel, SegmentationGateway } from "../contracts"
import { mapSegmentSummaryDtoToReadModel, mapSegmentSummaryReadModelToViewModel } from "../mappers"
import { GetSegmentSummaryQuery } from "../queries"
import { segmentIdSchema } from "../validators"

export class GetSegmentSummaryUseCase {
  private readonly query: GetSegmentSummaryQuery

  constructor(gateway: SegmentationGateway) {
    this.query = new GetSegmentSummaryQuery(gateway)
  }

  async execute(segmentId: string): Promise<SegmentSummaryViewModel | null> {
    segmentIdSchema.parse({ segmentId })
    const summary = await this.query.execute(segmentId)

    if (!summary) {
      return null
    }

    return mapSegmentSummaryReadModelToViewModel(mapSegmentSummaryDtoToReadModel(summary))
  }
}
