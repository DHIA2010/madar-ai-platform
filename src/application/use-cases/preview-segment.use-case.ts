import type {
  PreviewSegmentRequestDto,
  SegmentPreviewViewModel,
  SegmentationGateway,
} from "../contracts"
import { mapSegmentPreviewDtoToReadModel, mapSegmentPreviewReadModelToViewModel } from "../mappers"
import { PreviewSegmentQuery } from "../queries"
import { previewSegmentSchema } from "../validators"

export class PreviewSegmentUseCase {
  private readonly query: PreviewSegmentQuery

  constructor(gateway: SegmentationGateway) {
    this.query = new PreviewSegmentQuery(gateway)
  }

  async execute(input: PreviewSegmentRequestDto): Promise<SegmentPreviewViewModel> {
    const validatedInput = previewSegmentSchema.parse(input)
    const preview = await this.query.execute(validatedInput)
    return mapSegmentPreviewReadModelToViewModel(mapSegmentPreviewDtoToReadModel(preview))
  }
}
