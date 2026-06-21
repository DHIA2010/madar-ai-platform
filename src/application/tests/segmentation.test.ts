import { beforeEach, describe, expect, it } from "vitest"

import {
  DataCustomerIntelligenceRepository,
  DataSegmentationRepository,
  resetCustomerIntelligenceRepositoryState,
  resetSegmentationRepositoryState,
} from "@/infrastructure"

import { SegmentationApplicationService } from "../services"

function buildRootGroup() {
  return {
    groupId: "root",
    operator: "AND" as const,
    rules: [
      {
        ruleId: "r1",
        field: "country" as const,
        operator: "equals" as const,
        value: "SA",
      },
      {
        ruleId: "r2",
        field: "purchase_count" as const,
        operator: "greater than" as const,
        value: 0,
      },
    ],
    groups: [],
  }
}

describe("segmentation engine", () => {
  beforeEach(() => {
    resetCustomerIntelligenceRepositoryState()
    resetSegmentationRepositoryState()
  })

  it("evaluates rules with nested groups and AND/OR logic", async () => {
    const intelligence = new DataCustomerIntelligenceRepository()

    const session = await intelligence.startSession({
      visitorId: "v_seg_1",
      startedAt: "2026-02-01T10:00:00.000Z",
      entryPage: "/",
      source: "google",
      medium: "cpc",
      campaign: "c1",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
    })

    await intelligence.trackEvent({
      eventId: "evt_purchase_1",
      visitorId: "v_seg_1",
      sessionId: session.sessionId,
      timestamp: "2026-02-01T10:01:00.000Z",
      eventName: "purchase",
      page: "/checkout/success",
      source: "google",
      medium: "cpc",
      campaign: "c1",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
      metadata: { revenue: 200, productId: "sku-1" },
    })

    const repository = new DataSegmentationRepository()
    const service = new SegmentationApplicationService(repository)

    const created = await service.createSegment({
      name: "SA Buyers",
      description: "Visitors from SA with purchases",
      audienceType: "dynamic",
      rootGroup: {
        groupId: "g_root",
        operator: "AND",
        rules: [
          {
            ruleId: "country_is_sa",
            field: "country",
            operator: "equals",
            value: "SA",
          },
        ],
        groups: [
          {
            groupId: "g_nested",
            operator: "OR",
            rules: [
              {
                ruleId: "has_purchase",
                field: "purchase_count",
                operator: "greater than",
                value: 0,
              },
              {
                ruleId: "is_returning",
                field: "returning_visitor",
                operator: "equals",
                value: true,
              },
            ],
            groups: [],
          },
        ],
      },
    })

    const audience = await service.evaluateSegment({
      segmentId: created.payload.segment.segmentId,
      mode: "full",
      candidateVisitorIds: ["v_seg_1"],
    })

    expect(audience.payload.totalMembers).toBe(1)
    expect(audience.payload.members[0]?.visitorId).toBe("v_seg_1")
  })

  it("supports segment membership retrieval and snapshot refresh", async () => {
    const intelligence = new DataCustomerIntelligenceRepository()

    const session = await intelligence.startSession({
      visitorId: "v_seg_2",
      startedAt: "2026-02-02T10:00:00.000Z",
      entryPage: "/home",
      source: "meta",
      medium: "paid-social",
      campaign: "c2",
      device: "desktop",
      browser: "safari",
      country: "SA",
      city: "Jeddah",
    })

    await intelligence.trackEvent({
      eventId: "evt_purchase_2",
      visitorId: "v_seg_2",
      sessionId: session.sessionId,
      timestamp: "2026-02-02T10:02:00.000Z",
      eventName: "purchase",
      page: "/checkout/success",
      source: "meta",
      medium: "paid-social",
      campaign: "c2",
      device: "desktop",
      browser: "safari",
      country: "SA",
      city: "Jeddah",
      metadata: { revenue: 120, productId: "sku-2" },
    })

    const repository = new DataSegmentationRepository()
    const service = new SegmentationApplicationService(repository)

    const segment = await service.createSegment({
      name: "High Intent",
      description: "Checkout or purchase users",
      audienceType: "dynamic",
      rootGroup: {
        groupId: "root",
        operator: "OR",
        rules: [
          {
            ruleId: "checkout_started",
            field: "checkout_started",
            operator: "equals",
            value: true,
          },
          {
            ruleId: "purchase_count",
            field: "purchase_count",
            operator: "greater than",
            value: 0,
          },
        ],
        groups: [],
      },
    })

    await service.evaluateSegment({
      segmentId: segment.payload.segment.segmentId,
      mode: "full",
      candidateVisitorIds: ["v_seg_2"],
    })

    const members = await service.getSegmentMembers(segment.payload.segment.segmentId)
    expect(members.payload.totalMembers).toBe(1)

    const stats = await service.refreshSegmentSnapshot({
      segmentId: segment.payload.segment.segmentId,
      mode: "snapshot",
      candidateVisitorIds: ["v_seg_2"],
    })

    expect(stats.payload.totalMembers).toBe(1)
    expect(stats.payload.purchases).toBeGreaterThanOrEqual(1)
  })

  it("supports preview generation and repository behavior", async () => {
    const intelligence = new DataCustomerIntelligenceRepository()

    const session = await intelligence.startSession({
      visitorId: "v_seg_3",
      startedAt: "2026-02-03T10:00:00.000Z",
      entryPage: "/products",
      source: "google",
      medium: "cpc",
      campaign: "c3",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Dammam",
    })

    await intelligence.trackEvent({
      eventId: "evt_product_view_3",
      visitorId: "v_seg_3",
      sessionId: session.sessionId,
      timestamp: "2026-02-03T10:01:00.000Z",
      eventName: "product_view",
      page: "/products/sku-9",
      source: "google",
      medium: "cpc",
      campaign: "c3",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Dammam",
      metadata: { productId: "sku-9" },
    })

    const repository = new DataSegmentationRepository()
    const service = new SegmentationApplicationService(repository)

    const preview = await service.previewSegment({
      rootGroup: {
        groupId: "preview-root",
        operator: "AND",
        rules: [
          {
            ruleId: "viewed_sku_9",
            field: "product_viewed",
            operator: "contains",
            value: "sku-9",
          },
        ],
        groups: [],
      },
      candidateVisitorIds: ["v_seg_3"],
      limit: 10,
    })

    expect(preview.payload.estimatedMembers).toBe(1)
    expect(preview.payload.sampleMembers[0]?.visitorId).toBe("v_seg_3")

    const created = await service.createSegment({
      name: "Temp Segment",
      description: "for delete behavior",
      audienceType: "dynamic",
      rootGroup: buildRootGroup(),
    })

    const deleted = await service.deleteSegment(created.payload.segment.segmentId)
    expect(deleted?.payload.segment.segmentId).toBe(created.payload.segment.segmentId)

    const summaryAfterDelete = await service.getSegmentSummary(created.payload.segment.segmentId)
    expect(summaryAfterDelete).toBeNull()
  })
})
