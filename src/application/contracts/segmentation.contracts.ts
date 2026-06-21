import type { ReadModel, ReadModelViewModel } from "./read-model.contracts"

export type SegmentAudienceType = "dynamic" | "static"
export type SegmentStatus = "draft" | "active" | "archived"

export type SegmentRuleOperator =
  | "equals"
  | "not equals"
  | "contains"
  | "starts with"
  | "ends with"
  | "greater than"
  | "less than"
  | "between"
  | "exists"
  | "not exists"
  | "in"
  | "not in"

export type SegmentGroupOperator = "AND" | "OR"

export type SegmentRuleField =
  | "visitor_attribute"
  | "customer_attribute"
  | "session_attribute"
  | "journey_attribute"
  | "traffic_source"
  | "campaign_source"
  | "device"
  | "browser"
  | "country"
  | "city"
  | "purchase_count"
  | "revenue"
  | "aov"
  | "last_visit"
  | "first_visit"
  | "days_since_purchase"
  | "days_since_visit"
  | "product_viewed"
  | "category_viewed"
  | "product_purchased"
  | "cart_abandoned"
  | "checkout_started"
  | "returning_visitor"
  | "known_customer"
  | "anonymous_visitor"

export interface SegmentRule {
  ruleId: string
  field: SegmentRuleField
  operator: SegmentRuleOperator
  value?: string | number | boolean | [number, number] | [string, string] | string[] | number[]
  attributeKey?: string
  not?: boolean
}

export interface SegmentGroup {
  groupId: string
  operator: SegmentGroupOperator
  rules: SegmentRule[]
  groups: SegmentGroup[]
  not?: boolean
}

export interface Segment {
  segmentId: string
  name: string
  description: string
  audienceType: SegmentAudienceType
  status: SegmentStatus
  rootGroup: SegmentGroup
  staticVisitorIds: string[]
  createdAt: string
  updatedAt: string
}

export interface Audience {
  audienceId: string
  segmentId: string
  audienceType: SegmentAudienceType
  totalMembers: number
  members: SegmentMembership[]
  evaluatedAt: string
}

export interface DynamicAudience extends Audience {
  audienceType: "dynamic"
}

export interface StaticAudience extends Audience {
  audienceType: "static"
}

export interface SegmentMembership {
  segmentId: string
  visitorId: string
  customerId?: string
  matchedAt: string
  reason: string
}

export type SegmentEvaluationMode = "lazy" | "snapshot" | "incremental" | "full"

export interface SegmentEvaluation {
  segmentId: string
  evaluatedAt: string
  mode: SegmentEvaluationMode
  totalEvaluated: number
  totalMatched: number
  memberships: SegmentMembership[]
}

export interface SegmentSnapshot {
  snapshotId: string
  segmentId: string
  generatedAt: string
  mode: SegmentEvaluationMode
  memberships: SegmentMembership[]
}

export interface SegmentSummaryDto {
  segment: Segment
  totalMembers: number
  lastEvaluatedAt?: string
  latestSnapshotId?: string
}

export interface SegmentMembersDto {
  segmentId: string
  totalMembers: number
  memberships: SegmentMembership[]
}

export interface SegmentPreviewDto {
  estimatedMembers: number
  sampleMembers: SegmentMembership[]
}

export interface AudienceStatisticsDto {
  segmentId: string
  totalMembers: number
  knownCustomers: number
  anonymousVisitors: number
  returningVisitors: number
  purchases: number
  revenue: number
}

export interface CreateSegmentRequestDto {
  name: string
  description: string
  audienceType: SegmentAudienceType
  rootGroup: SegmentGroup
  staticVisitorIds?: string[]
}

export interface UpdateSegmentRequestDto {
  name?: string
  description?: string
  audienceType?: SegmentAudienceType
  status?: SegmentStatus
  rootGroup?: SegmentGroup
  staticVisitorIds?: string[]
}

export interface EvaluateSegmentRequestDto {
  segmentId: string
  mode?: SegmentEvaluationMode
  candidateVisitorIds?: string[]
}

export interface RefreshSegmentSnapshotRequestDto {
  segmentId: string
  mode?: SegmentEvaluationMode
  candidateVisitorIds?: string[]
}

export interface PreviewSegmentRequestDto {
  rootGroup: SegmentGroup
  candidateVisitorIds?: string[]
  limit?: number
}

export interface SegmentationRepository {
  createSegment(input: CreateSegmentRequestDto): Promise<Segment>
  updateSegment(segmentId: string, input: UpdateSegmentRequestDto): Promise<Segment | null>
  deleteSegment(segmentId: string): Promise<boolean>
  evaluateSegment(input: EvaluateSegmentRequestDto): Promise<SegmentEvaluation>
  evaluateAudience(segmentId: string, mode?: SegmentEvaluationMode): Promise<Audience>
  refreshSegmentSnapshot(input: RefreshSegmentSnapshotRequestDto): Promise<SegmentSnapshot>
  getSegmentMembers(segmentId: string): Promise<SegmentMembership[]>
  getSegmentSummary(segmentId: string): Promise<SegmentSummaryDto | null>
  previewSegment(input: PreviewSegmentRequestDto): Promise<SegmentPreviewDto>
  getAudienceStatistics(segmentId: string): Promise<AudienceStatisticsDto | null>
}

export type SegmentationGateway = SegmentationRepository

export type SegmentSummaryReadModel = ReadModel<SegmentSummaryDto>
export type SegmentSummaryViewModel = ReadModelViewModel<SegmentSummaryDto>

export type SegmentMembersReadModel = ReadModel<SegmentMembersDto>
export type SegmentMembersViewModel = ReadModelViewModel<SegmentMembersDto>

export type SegmentPreviewReadModel = ReadModel<SegmentPreviewDto>
export type SegmentPreviewViewModel = ReadModelViewModel<SegmentPreviewDto>

export type AudienceReadModel = ReadModel<Audience>
export type AudienceViewModel = ReadModelViewModel<Audience>

export type AudienceStatisticsReadModel = ReadModel<AudienceStatisticsDto>
export type AudienceStatisticsViewModel = ReadModelViewModel<AudienceStatisticsDto>
