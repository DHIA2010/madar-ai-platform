import type {
  Audience,
  AudienceStatisticsDto,
  CreateSegmentRequestDto,
  EvaluateSegmentRequestDto,
  PreviewSegmentRequestDto,
  RefreshSegmentSnapshotRequestDto,
  Segment,
  SegmentEvaluation,
  SegmentMembership,
  SegmentSnapshot,
  SegmentSummaryDto,
  SegmentationGateway,
  UpdateSegmentRequestDto,
} from "../contracts"

export class CreateSegmentQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(input: CreateSegmentRequestDto): Promise<Segment> {
    return this.gateway.createSegment(input)
  }
}

export class UpdateSegmentQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(segmentId: string, input: UpdateSegmentRequestDto): Promise<Segment | null> {
    return this.gateway.updateSegment(segmentId, input)
  }
}

export class DeleteSegmentQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(segmentId: string): Promise<boolean> {
    return this.gateway.deleteSegment(segmentId)
  }
}

export class EvaluateSegmentQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(input: EvaluateSegmentRequestDto): Promise<SegmentEvaluation> {
    return this.gateway.evaluateSegment(input)
  }
}

export class EvaluateAudienceQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(segmentId: string, mode?: EvaluateSegmentRequestDto["mode"]): Promise<Audience> {
    return this.gateway.evaluateAudience(segmentId, mode)
  }
}

export class RefreshSegmentSnapshotQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(input: RefreshSegmentSnapshotRequestDto): Promise<SegmentSnapshot> {
    return this.gateway.refreshSegmentSnapshot(input)
  }
}

export class GetSegmentMembersQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(segmentId: string): Promise<SegmentMembership[]> {
    return this.gateway.getSegmentMembers(segmentId)
  }
}

export class GetSegmentSummaryQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(segmentId: string): Promise<SegmentSummaryDto | null> {
    return this.gateway.getSegmentSummary(segmentId)
  }
}

export class PreviewSegmentQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(input: PreviewSegmentRequestDto) {
    return this.gateway.previewSegment(input)
  }
}

export class GetAudienceStatisticsQuery {
  constructor(private readonly gateway: SegmentationGateway) {}

  execute(segmentId: string): Promise<AudienceStatisticsDto | null> {
    return this.gateway.getAudienceStatistics(segmentId)
  }
}
