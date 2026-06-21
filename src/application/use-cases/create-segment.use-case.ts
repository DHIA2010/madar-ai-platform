import type {
  CreateSegmentRequestDto,
  SegmentSummaryViewModel,
  SegmentationGateway,
} from "../contracts"
import { mapSegmentSummaryDtoToReadModel, mapSegmentSummaryReadModelToViewModel } from "../mappers"
import { CreateSegmentQuery } from "../queries"
import { createSegmentSchema } from "../validators"

export class CreateSegmentUseCase {
  private readonly query: CreateSegmentQuery

  constructor(gateway: SegmentationGateway) {
    this.query = new CreateSegmentQuery(gateway)
  }

  async execute(input: CreateSegmentRequestDto): Promise<SegmentSummaryViewModel> {
    const validatedInput = createSegmentSchema.parse(input)
    const segment = await this.query.execute(validatedInput)

    return mapSegmentSummaryReadModelToViewModel(
      mapSegmentSummaryDtoToReadModel({
        segment,
        totalMembers: 0,
      })
    )
  }
}
