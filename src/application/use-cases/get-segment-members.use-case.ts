import type { SegmentMembersViewModel, SegmentationGateway } from "../contracts"
import { mapSegmentMembersDtoToReadModel, mapSegmentMembersReadModelToViewModel } from "../mappers"
import { GetSegmentMembersQuery } from "../queries"
import { segmentIdSchema } from "../validators"

export class GetSegmentMembersUseCase {
  private readonly query: GetSegmentMembersQuery

  constructor(gateway: SegmentationGateway) {
    this.query = new GetSegmentMembersQuery(gateway)
  }

  async execute(segmentId: string): Promise<SegmentMembersViewModel> {
    segmentIdSchema.parse({ segmentId })
    const memberships = await this.query.execute(segmentId)
    return mapSegmentMembersReadModelToViewModel(
      mapSegmentMembersDtoToReadModel({
        segmentId,
        totalMembers: memberships.length,
        memberships,
      })
    )
  }
}
