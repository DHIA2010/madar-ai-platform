import type { SegmentSummaryViewModel, SegmentationGateway } from "../contracts"
import { mapSegmentSummaryDtoToReadModel, mapSegmentSummaryReadModelToViewModel } from "../mappers"
import { DeleteSegmentQuery, GetSegmentSummaryQuery } from "../queries"
import { segmentIdSchema } from "../validators"

export class DeleteSegmentUseCase {
  private readonly deleteQuery: DeleteSegmentQuery
  private readonly summaryQuery: GetSegmentSummaryQuery

  constructor(gateway: SegmentationGateway) {
    this.deleteQuery = new DeleteSegmentQuery(gateway)
    this.summaryQuery = new GetSegmentSummaryQuery(gateway)
  }

  async execute(segmentId: string): Promise<SegmentSummaryViewModel | null> {
    segmentIdSchema.parse({ segmentId })
    const summary = await this.summaryQuery.execute(segmentId)
    if (!summary) {
      return null
    }

    const deleted = await this.deleteQuery.execute(segmentId)
    if (!deleted) {
      return null
    }

    return mapSegmentSummaryReadModelToViewModel(mapSegmentSummaryDtoToReadModel(summary))
  }
}
