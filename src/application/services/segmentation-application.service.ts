import type {
  AudienceStatisticsViewModel,
  AudienceViewModel,
  CreateSegmentRequestDto,
  EvaluateSegmentRequestDto,
  PreviewSegmentRequestDto,
  RefreshSegmentSnapshotRequestDto,
  SegmentMembersViewModel,
  SegmentPreviewViewModel,
  SegmentSummaryViewModel,
  SegmentationGateway,
  UpdateSegmentRequestDto,
} from "../contracts"
import {
  CreateSegmentUseCase,
  DeleteSegmentUseCase,
  EvaluateAudienceUseCase,
  EvaluateSegmentUseCase,
  GetAudienceStatisticsUseCase,
  GetSegmentMembersUseCase,
  GetSegmentSummaryUseCase,
  PreviewSegmentUseCase,
  RefreshSegmentSnapshotUseCase,
  UpdateSegmentUseCase,
} from "../use-cases"

export class SegmentationApplicationService {
  private readonly createSegmentUseCase: CreateSegmentUseCase
  private readonly updateSegmentUseCase: UpdateSegmentUseCase
  private readonly deleteSegmentUseCase: DeleteSegmentUseCase
  private readonly evaluateSegmentUseCase: EvaluateSegmentUseCase
  private readonly evaluateAudienceUseCase: EvaluateAudienceUseCase
  private readonly refreshSegmentSnapshotUseCase: RefreshSegmentSnapshotUseCase
  private readonly getSegmentMembersUseCase: GetSegmentMembersUseCase
  private readonly getSegmentSummaryUseCase: GetSegmentSummaryUseCase
  private readonly previewSegmentUseCase: PreviewSegmentUseCase
  private readonly getAudienceStatisticsUseCase: GetAudienceStatisticsUseCase

  constructor(gateway: SegmentationGateway) {
    this.createSegmentUseCase = new CreateSegmentUseCase(gateway)
    this.updateSegmentUseCase = new UpdateSegmentUseCase(gateway)
    this.deleteSegmentUseCase = new DeleteSegmentUseCase(gateway)
    this.evaluateSegmentUseCase = new EvaluateSegmentUseCase(gateway)
    this.evaluateAudienceUseCase = new EvaluateAudienceUseCase(gateway)
    this.refreshSegmentSnapshotUseCase = new RefreshSegmentSnapshotUseCase(gateway)
    this.getSegmentMembersUseCase = new GetSegmentMembersUseCase(gateway)
    this.getSegmentSummaryUseCase = new GetSegmentSummaryUseCase(gateway)
    this.previewSegmentUseCase = new PreviewSegmentUseCase(gateway)
    this.getAudienceStatisticsUseCase = new GetAudienceStatisticsUseCase(gateway)
  }

  createSegment(input: CreateSegmentRequestDto): Promise<SegmentSummaryViewModel> {
    return this.createSegmentUseCase.execute(input)
  }

  updateSegment(
    segmentId: string,
    input: UpdateSegmentRequestDto
  ): Promise<SegmentSummaryViewModel | null> {
    return this.updateSegmentUseCase.execute(segmentId, input)
  }

  deleteSegment(segmentId: string): Promise<SegmentSummaryViewModel | null> {
    return this.deleteSegmentUseCase.execute(segmentId)
  }

  evaluateSegment(input: EvaluateSegmentRequestDto): Promise<AudienceViewModel> {
    return this.evaluateSegmentUseCase.execute(input)
  }

  evaluateAudience(
    segmentId: string,
    mode?: EvaluateSegmentRequestDto["mode"]
  ): Promise<AudienceViewModel> {
    return this.evaluateAudienceUseCase.execute(segmentId, mode)
  }

  refreshSegmentSnapshot(
    input: RefreshSegmentSnapshotRequestDto
  ): Promise<AudienceStatisticsViewModel> {
    return this.refreshSegmentSnapshotUseCase.execute(input)
  }

  getSegmentMembers(segmentId: string): Promise<SegmentMembersViewModel> {
    return this.getSegmentMembersUseCase.execute(segmentId)
  }

  getSegmentSummary(segmentId: string): Promise<SegmentSummaryViewModel | null> {
    return this.getSegmentSummaryUseCase.execute(segmentId)
  }

  previewSegment(input: PreviewSegmentRequestDto): Promise<SegmentPreviewViewModel> {
    return this.previewSegmentUseCase.execute(input)
  }

  getAudienceStatistics(segmentId: string): Promise<AudienceStatisticsViewModel | null> {
    return this.getAudienceStatisticsUseCase.execute(segmentId)
  }
}
