import type {
  AudienceStatisticsViewModel,
  RefreshSegmentSnapshotRequestDto,
  SegmentationGateway,
} from "../contracts"
import {
  mapAudienceStatisticsDtoToReadModel,
  mapAudienceStatisticsReadModelToViewModel,
} from "../mappers"
import { GetAudienceStatisticsQuery, RefreshSegmentSnapshotQuery } from "../queries"
import { refreshSegmentSnapshotSchema } from "../validators"

export class RefreshSegmentSnapshotUseCase {
  private readonly refreshQuery: RefreshSegmentSnapshotQuery
  private readonly statisticsQuery: GetAudienceStatisticsQuery

  constructor(gateway: SegmentationGateway) {
    this.refreshQuery = new RefreshSegmentSnapshotQuery(gateway)
    this.statisticsQuery = new GetAudienceStatisticsQuery(gateway)
  }

  async execute(input: RefreshSegmentSnapshotRequestDto): Promise<AudienceStatisticsViewModel> {
    const validatedInput = refreshSegmentSnapshotSchema.parse(input)
    await this.refreshQuery.execute(validatedInput)

    const statistics = await this.statisticsQuery.execute(validatedInput.segmentId)

    if (!statistics) {
      throw new Error(`Audience statistics were not found for segment ${validatedInput.segmentId}.`)
    }

    return mapAudienceStatisticsReadModelToViewModel(
      mapAudienceStatisticsDtoToReadModel(statistics)
    )
  }
}
