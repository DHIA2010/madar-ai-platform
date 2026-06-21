import type {
  Audience,
  AudienceStatisticsDto,
  CreateSegmentRequestDto,
  EvaluateSegmentRequestDto,
  PreviewSegmentRequestDto,
  RefreshSegmentSnapshotRequestDto,
  Segment,
  SegmentEvaluation,
  SegmentGroup,
  SegmentMembership,
  SegmentRule,
  SegmentSnapshot,
  SegmentSummaryDto,
  SegmentationRepository,
  TrackingEventDto,
  UpdateSegmentRequestDto,
  VisitorSummaryDto,
} from "@/application/contracts"
import { NotFoundError, mapRepositoryError } from "@/infrastructure/data/errors"

import { DataCustomerIntelligenceRepository } from "./customer-intelligence.repository"

type SegmentStoreRecord = {
  segment: Segment
  memberships: SegmentMembership[]
  snapshots: SegmentSnapshot[]
  lastEvaluation?: SegmentEvaluation
}

let segmentCounter = 0
let snapshotCounter = 0

const segmentStore = new Map<string, SegmentStoreRecord>()

const intelligenceRepository = new DataCustomerIntelligenceRepository()

function nextSegmentId() {
  segmentCounter += 1
  return `seg_${String(segmentCounter).padStart(6, "0")}`
}

function nextSnapshotId() {
  snapshotCounter += 1
  return `seg_snap_${String(snapshotCounter).padStart(6, "0")}`
}

function normalizeString(value: unknown): string {
  return String(value ?? "").toLowerCase()
}

function getEventValues(
  events: TrackingEventDto[],
  eventName: TrackingEventDto["eventName"],
  field: "page" | "categoryId" | "productId"
) {
  if (field === "page") {
    return events.filter((event) => event.eventName === eventName).map((event) => event.page)
  }

  return events
    .filter((event) => event.eventName === eventName)
    .map((event) => String(event.metadata[field] ?? ""))
}

function parseDate(value: unknown): Date | null {
  if (!value) {
    return null
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysSince(value: unknown): number {
  const parsed = parseDate(value)
  if (!parsed) {
    return Number.MAX_SAFE_INTEGER
  }
  const now = new Date()
  const diff = now.getTime() - parsed.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function evaluateOperator(
  operator: SegmentRule["operator"],
  candidate: unknown,
  expected: SegmentRule["value"]
): boolean {
  switch (operator) {
    case "equals":
      return normalizeString(candidate) === normalizeString(expected)
    case "not equals":
      return normalizeString(candidate) !== normalizeString(expected)
    case "contains":
      return normalizeString(candidate).includes(normalizeString(expected))
    case "starts with":
      return normalizeString(candidate).startsWith(normalizeString(expected))
    case "ends with":
      return normalizeString(candidate).endsWith(normalizeString(expected))
    case "greater than":
      return Number(candidate ?? 0) > Number(expected ?? 0)
    case "less than":
      return Number(candidate ?? 0) < Number(expected ?? 0)
    case "between": {
      if (!Array.isArray(expected) || expected.length !== 2) {
        return false
      }
      const value = Number(candidate ?? 0)
      const min = Number(expected[0])
      const max = Number(expected[1])
      return value >= min && value <= max
    }
    case "exists":
      return candidate !== undefined && candidate !== null && candidate !== ""
    case "not exists":
      return candidate === undefined || candidate === null || candidate === ""
    case "in":
      return Array.isArray(expected)
        ? expected.map((item) => normalizeString(item)).includes(normalizeString(candidate))
        : false
    case "not in":
      return Array.isArray(expected)
        ? !expected.map((item) => normalizeString(item)).includes(normalizeString(candidate))
        : false
    default:
      return false
  }
}

async function evaluateRule(rule: SegmentRule, visitorId: string): Promise<boolean> {
  const visitorHistory = await intelligenceRepository.getVisitorHistory(visitorId)
  if (!visitorHistory) {
    return false
  }

  const journey = await intelligenceRepository.getJourney({ visitorId })
  const timeline = journey?.events ?? visitorHistory.events

  const purchases = timeline.filter((event) => event.eventName === "purchase")
  const addToCartEvents = timeline.filter((event) => event.eventName === "add_to_cart")
  const removeFromCartEvents = timeline.filter((event) => event.eventName === "remove_from_cart")
  const checkoutEvents = timeline.filter((event) => event.eventName === "begin_checkout")

  const revenue = purchases.reduce((sum, event) => sum + Number(event.metadata.revenue ?? 0), 0)
  const purchaseCount = purchases.length
  const aov = purchaseCount > 0 ? revenue / purchaseCount : 0

  const sessionCount = visitorHistory.sessions.length
  const firstVisit = visitorHistory.visitor.firstSeenAt
  const lastVisit = visitorHistory.visitor.lastSeenAt
  const lastPurchase = purchases.at(-1)?.timestamp

  let candidate: unknown

  switch (rule.field) {
    case "traffic_source":
      candidate = visitorHistory.sessions.at(-1)?.source
      break
    case "campaign_source":
      candidate = visitorHistory.sessions.at(-1)?.campaign
      break
    case "device":
      candidate = visitorHistory.sessions.at(-1)?.device
      break
    case "browser":
      candidate = visitorHistory.sessions.at(-1)?.browser
      break
    case "country":
      candidate = visitorHistory.sessions.at(-1)?.country
      break
    case "city":
      candidate = visitorHistory.sessions.at(-1)?.city
      break
    case "purchase_count":
      candidate = purchaseCount
      break
    case "revenue":
      candidate = revenue
      break
    case "aov":
      candidate = aov
      break
    case "last_visit":
      candidate = lastVisit
      break
    case "first_visit":
      candidate = firstVisit
      break
    case "days_since_purchase":
      candidate = daysSince(lastPurchase)
      break
    case "days_since_visit":
      candidate = daysSince(lastVisit)
      break
    case "product_viewed":
      candidate = getEventValues(timeline, "product_view", "productId")
      break
    case "category_viewed":
      candidate = getEventValues(timeline, "category_view", "categoryId")
      break
    case "product_purchased":
      candidate = purchases.map((event) => String(event.metadata.productId ?? ""))
      break
    case "cart_abandoned":
      candidate = addToCartEvents.length > purchases.length || removeFromCartEvents.length > 0
      break
    case "checkout_started":
      candidate = checkoutEvents.length > 0
      break
    case "returning_visitor":
      candidate = sessionCount > 1
      break
    case "known_customer":
      candidate = !visitorHistory.visitor.isAnonymous
      break
    case "anonymous_visitor":
      candidate = visitorHistory.visitor.isAnonymous
      break
    case "visitor_attribute":
      candidate = rule.attributeKey
        ? (visitorHistory.visitor as unknown as Record<string, unknown>)[rule.attributeKey]
        : undefined
      break
    case "customer_attribute": {
      const timelineData = visitorHistory.events
      candidate = rule.attributeKey
        ? timelineData.map(
            (event) => (event.metadata as Record<string, unknown>)[rule.attributeKey as string]
          )
        : undefined
      break
    }
    case "session_attribute": {
      const lastSession = visitorHistory.sessions.at(-1)
      candidate = rule.attributeKey
        ? (lastSession as Record<string, unknown> | undefined)?.[rule.attributeKey]
        : undefined
      break
    }
    case "journey_attribute": {
      const journeyPayload = journey as Record<string, unknown> | null
      candidate = rule.attributeKey ? journeyPayload?.[rule.attributeKey] : undefined
      break
    }
    default:
      candidate = undefined
  }

  let result: boolean

  if (
    Array.isArray(candidate) &&
    ["contains", "in", "not in", "equals", "not equals"].includes(rule.operator)
  ) {
    const expected = rule.value
    if (rule.operator === "contains" || rule.operator === "equals") {
      result = candidate.map((item) => normalizeString(item)).includes(normalizeString(expected))
    } else if (rule.operator === "not equals") {
      result = !candidate.map((item) => normalizeString(item)).includes(normalizeString(expected))
    } else if (rule.operator === "in") {
      result = Array.isArray(expected)
        ? candidate
            .map((item) => normalizeString(item))
            .some((item) => expected.map((entry) => normalizeString(entry)).includes(item))
        : false
    } else {
      result = Array.isArray(expected)
        ? !candidate
            .map((item) => normalizeString(item))
            .some((item) => expected.map((entry) => normalizeString(entry)).includes(item))
        : false
    }
  } else {
    result = evaluateOperator(rule.operator, candidate, rule.value)
  }

  return rule.not ? !result : result
}

async function evaluateGroup(group: SegmentGroup, visitorId: string): Promise<boolean> {
  const ruleResults = await Promise.all(group.rules.map((rule) => evaluateRule(rule, visitorId)))
  const groupResults = await Promise.all(
    group.groups.map((entry) => evaluateGroup(entry, visitorId))
  )

  const evaluations = [...ruleResults, ...groupResults]
  const base =
    evaluations.length === 0
      ? true
      : group.operator === "AND"
        ? evaluations.every(Boolean)
        : evaluations.some(Boolean)

  return group.not ? !base : base
}

async function resolveCandidateVisitorIds(candidateVisitorIds?: string[]): Promise<string[]> {
  if (candidateVisitorIds && candidateVisitorIds.length > 0) {
    return candidateVisitorIds
  }

  const trafficSources = await intelligenceRepository.getTrafficSources()
  const fromTraffic = trafficSources
    .map((entry) => entry.campaign)
    .filter(Boolean)
    .map((campaign, index) => `visitor_from_campaign_${campaign}_${index}`)

  return fromTraffic.length > 0 ? fromTraffic : []
}

async function deriveSegmentMemberships(
  segment: Segment,
  candidateVisitorIds?: string[]
): Promise<SegmentMembership[]> {
  const visitorIds =
    segment.audienceType === "static"
      ? segment.staticVisitorIds
      : await resolveCandidateVisitorIds(candidateVisitorIds)

  const memberships: SegmentMembership[] = []

  for (const visitorId of visitorIds) {
    const visitorHistory = await intelligenceRepository.getVisitorHistory(visitorId)
    if (!visitorHistory) {
      continue
    }

    const isMatch =
      segment.audienceType === "static"
        ? segment.staticVisitorIds.includes(visitorId)
        : await evaluateGroup(segment.rootGroup, visitorId)

    if (!isMatch) {
      continue
    }

    memberships.push({
      segmentId: segment.segmentId,
      visitorId,
      customerId: visitorHistory.visitor.customerId,
      matchedAt: new Date().toISOString(),
      reason: `Matched segment ${segment.name}`,
    })
  }

  return memberships
}

async function buildAudience(
  segment: Segment,
  memberships: SegmentMembership[]
): Promise<Audience> {
  return {
    audienceId: `aud_${segment.segmentId}`,
    segmentId: segment.segmentId,
    audienceType: segment.audienceType,
    totalMembers: memberships.length,
    members: memberships,
    evaluatedAt: new Date().toISOString(),
  }
}

async function buildAudienceStatistics(
  segmentId: string,
  memberships: SegmentMembership[]
): Promise<AudienceStatisticsDto> {
  let purchases = 0
  let revenue = 0
  let returningVisitors = 0
  let anonymousVisitors = 0
  let knownCustomers = 0

  for (const membership of memberships) {
    const history = await intelligenceRepository.getVisitorHistory(membership.visitorId)
    if (!history) {
      continue
    }

    if (history.visitor.isAnonymous) {
      anonymousVisitors += 1
    } else {
      knownCustomers += 1
    }

    if (history.sessions.length > 1) {
      returningVisitors += 1
    }

    const purchaseEvents = history.events.filter((event) => event.eventName === "purchase")
    purchases += purchaseEvents.length
    revenue += purchaseEvents.reduce((sum, event) => sum + Number(event.metadata.revenue ?? 0), 0)
  }

  return {
    segmentId,
    totalMembers: memberships.length,
    knownCustomers,
    anonymousVisitors,
    returningVisitors,
    purchases,
    revenue,
  }
}

export class DataSegmentationRepository implements SegmentationRepository {
  async createSegment(input: CreateSegmentRequestDto): Promise<Segment> {
    try {
      const now = new Date().toISOString()
      const segment: Segment = {
        segmentId: nextSegmentId(),
        name: input.name,
        description: input.description,
        audienceType: input.audienceType,
        status: "draft",
        rootGroup: input.rootGroup,
        staticVisitorIds: input.staticVisitorIds ?? [],
        createdAt: now,
        updatedAt: now,
      }

      segmentStore.set(segment.segmentId, {
        segment,
        memberships: [],
        snapshots: [],
      })

      return segment
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async updateSegment(segmentId: string, input: UpdateSegmentRequestDto): Promise<Segment | null> {
    try {
      const existing = segmentStore.get(segmentId)
      if (!existing) {
        return null
      }

      const updated: Segment = {
        ...existing.segment,
        ...input,
        updatedAt: new Date().toISOString(),
      }

      segmentStore.set(segmentId, {
        ...existing,
        segment: updated,
      })

      return updated
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async deleteSegment(segmentId: string): Promise<boolean> {
    try {
      return segmentStore.delete(segmentId)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async evaluateSegment(input: EvaluateSegmentRequestDto): Promise<SegmentEvaluation> {
    try {
      const existing = segmentStore.get(input.segmentId)
      if (!existing) {
        throw new NotFoundError({ message: `Segment ${input.segmentId} was not found.` })
      }

      let memberships: SegmentMembership[]

      if (input.mode === "lazy" && existing.memberships.length > 0) {
        memberships = existing.memberships
      } else if (input.mode === "incremental" && input.candidateVisitorIds?.length) {
        const candidateMemberships = await deriveSegmentMemberships(
          existing.segment,
          input.candidateVisitorIds
        )
        const merged = new Map<string, SegmentMembership>()
        for (const membership of existing.memberships) {
          merged.set(membership.visitorId, membership)
        }
        for (const membership of candidateMemberships) {
          merged.set(membership.visitorId, membership)
        }
        memberships = [...merged.values()]
      } else {
        memberships = await deriveSegmentMemberships(existing.segment, input.candidateVisitorIds)
      }

      const evaluation: SegmentEvaluation = {
        segmentId: existing.segment.segmentId,
        evaluatedAt: new Date().toISOString(),
        mode: input.mode ?? "full",
        totalEvaluated: input.candidateVisitorIds?.length ?? memberships.length,
        totalMatched: memberships.length,
        memberships,
      }

      segmentStore.set(input.segmentId, {
        ...existing,
        memberships,
        lastEvaluation: evaluation,
      })

      return evaluation
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async evaluateAudience(
    segmentId: string,
    mode?: EvaluateSegmentRequestDto["mode"]
  ): Promise<Audience> {
    try {
      const existing = segmentStore.get(segmentId)
      if (!existing) {
        throw new NotFoundError({ message: `Segment ${segmentId} was not found.` })
      }

      if (!existing.lastEvaluation || mode) {
        await this.evaluateSegment({
          segmentId,
          mode,
        })
      }

      const refreshed = segmentStore.get(segmentId)
      if (!refreshed) {
        throw new NotFoundError({ message: `Segment ${segmentId} was not found after evaluation.` })
      }

      return buildAudience(refreshed.segment, refreshed.memberships)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async refreshSegmentSnapshot(input: RefreshSegmentSnapshotRequestDto): Promise<SegmentSnapshot> {
    try {
      const existing = segmentStore.get(input.segmentId)
      if (!existing) {
        throw new NotFoundError({ message: `Segment ${input.segmentId} was not found.` })
      }

      const evaluation = await this.evaluateSegment({
        segmentId: input.segmentId,
        mode: input.mode ?? "snapshot",
        candidateVisitorIds: input.candidateVisitorIds,
      })

      const snapshot: SegmentSnapshot = {
        snapshotId: nextSnapshotId(),
        segmentId: input.segmentId,
        generatedAt: new Date().toISOString(),
        mode: input.mode ?? "snapshot",
        memberships: evaluation.memberships,
      }

      segmentStore.set(input.segmentId, {
        ...existing,
        memberships: evaluation.memberships,
        snapshots: [...existing.snapshots, snapshot],
      })

      return snapshot
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getSegmentMembers(segmentId: string): Promise<SegmentMembership[]> {
    try {
      const existing = segmentStore.get(segmentId)
      if (!existing) {
        throw new NotFoundError({ message: `Segment ${segmentId} was not found.` })
      }

      return existing.memberships
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getSegmentSummary(segmentId: string): Promise<SegmentSummaryDto | null> {
    try {
      const existing = segmentStore.get(segmentId)
      if (!existing) {
        return null
      }

      return {
        segment: existing.segment,
        totalMembers: existing.memberships.length,
        lastEvaluatedAt: existing.lastEvaluation?.evaluatedAt,
        latestSnapshotId: existing.snapshots.at(-1)?.snapshotId,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async previewSegment(
    input: PreviewSegmentRequestDto
  ): Promise<{ estimatedMembers: number; sampleMembers: SegmentMembership[] }> {
    try {
      const temporarySegment: Segment = {
        segmentId: "preview",
        name: "Preview",
        description: "Preview segment",
        audienceType: "dynamic",
        status: "draft",
        rootGroup: input.rootGroup,
        staticVisitorIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const memberships = await deriveSegmentMemberships(
        temporarySegment,
        input.candidateVisitorIds
      )
      const limit = input.limit ?? 20

      return {
        estimatedMembers: memberships.length,
        sampleMembers: memberships.slice(0, limit),
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getAudienceStatistics(segmentId: string): Promise<AudienceStatisticsDto | null> {
    try {
      const existing = segmentStore.get(segmentId)
      if (!existing) {
        return null
      }

      return buildAudienceStatistics(segmentId, existing.memberships)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }
}

export function createSegmentationRepository(): SegmentationRepository {
  return new DataSegmentationRepository()
}

export function resetSegmentationRepositoryState() {
  segmentCounter = 0
  snapshotCounter = 0
  segmentStore.clear()
}
