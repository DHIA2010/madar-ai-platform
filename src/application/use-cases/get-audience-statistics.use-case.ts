import type { AudienceStatisticsViewModel, SegmentationGateway } from "../contracts"
import {
  mapAudienceStatisticsDtoToReadModel,
  mapAudienceStatisticsReadModelToViewModel,
} from "../mappers"
import { GetAudienceStatisticsQuery } from "../queries"
import { segmentIdSchema } from "../validators"

export class GetAudienceStatisticsUseCase {
  private readonly query: GetAudienceStatisticsQuery

  constructor(gateway: SegmentationGateway) {
    this.query = new GetAudienceStatisticsQuery(gateway)
  }

  async execute(segmentId: string): Promise<AudienceStatisticsViewModel | null> {
    segmentIdSchema.parse({ segmentId })
    const statistics = await this.query.execute(segmentId)

    if (!statistics) {
      return null
    }

    return mapAudienceStatisticsReadModelToViewModel(
      mapAudienceStatisticsDtoToReadModel(statistics)
    )
  }
}
