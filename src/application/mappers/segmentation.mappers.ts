import type {
  Audience,
  AudienceReadModel,
  AudienceStatisticsDto,
  AudienceStatisticsReadModel,
  AudienceStatisticsViewModel,
  AudienceViewModel,
  SegmentMembersDto,
  SegmentMembersReadModel,
  SegmentMembersViewModel,
  SegmentPreviewDto,
  SegmentPreviewReadModel,
  SegmentPreviewViewModel,
  SegmentSummaryDto,
  SegmentSummaryReadModel,
  SegmentSummaryViewModel,
} from "../contracts"
import { createReadModel } from "../read-models"

export function mapSegmentSummaryDtoToReadModel(
  payload: SegmentSummaryDto
): SegmentSummaryReadModel {
  return createReadModel({
    id: `segment-summary:${payload.segment.segmentId}`,
    owner: "segmentation",
    sourceDomains: ["segmentation", "customer-intelligence"],
    payload,
  })
}

export function mapSegmentSummaryReadModelToViewModel(
  readModel: SegmentSummaryReadModel
): SegmentSummaryViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapSegmentMembersDtoToReadModel(
  payload: SegmentMembersDto
): SegmentMembersReadModel {
  return createReadModel({
    id: `segment-members:${payload.segmentId}`,
    owner: "segmentation",
    sourceDomains: ["segmentation", "customer-intelligence"],
    payload,
  })
}

export function mapSegmentMembersReadModelToViewModel(
  readModel: SegmentMembersReadModel
): SegmentMembersViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapSegmentPreviewDtoToReadModel(
  payload: SegmentPreviewDto
): SegmentPreviewReadModel {
  return createReadModel({
    id: "segment-preview:temporary",
    owner: "segmentation",
    sourceDomains: ["segmentation", "customer-intelligence"],
    payload,
  })
}

export function mapSegmentPreviewReadModelToViewModel(
  readModel: SegmentPreviewReadModel
): SegmentPreviewViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapAudienceDtoToReadModel(payload: Audience): AudienceReadModel {
  return createReadModel({
    id: `audience:${payload.segmentId}`,
    owner: "segmentation",
    sourceDomains: ["segmentation", "customer-intelligence"],
    payload,
  })
}

export function mapAudienceReadModelToViewModel(readModel: AudienceReadModel): AudienceViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}

export function mapAudienceStatisticsDtoToReadModel(
  payload: AudienceStatisticsDto
): AudienceStatisticsReadModel {
  return createReadModel({
    id: `audience-statistics:${payload.segmentId}`,
    owner: "segmentation",
    sourceDomains: ["segmentation", "customer-intelligence"],
    payload,
  })
}

export function mapAudienceStatisticsReadModelToViewModel(
  readModel: AudienceStatisticsReadModel
): AudienceStatisticsViewModel {
  return {
    id: readModel.id,
    freshness: readModel.freshness,
    payload: readModel.payload,
  }
}
