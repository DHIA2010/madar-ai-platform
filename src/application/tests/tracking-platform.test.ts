import { describe, expect, it } from "vitest"

import { InMemoryTrackingDispatcher } from "@/infrastructure/tracking/tracking-dispatcher"

import { TrackingManager } from "../services/tracking-manager.service"

function sampleContext(
  overrides?: Partial<Parameters<TrackingManager["startSession"]>[0]["context"]>
) {
  return {
    timestamp: new Date().toISOString(),
    timezone: "Asia/Riyadh",
    language: "ar",
    currency: "SAR",
    location: {
      country: "SA",
      city: "Riyadh",
    },
    device: {
      deviceId: "device_1",
      type: "mobile" as const,
      browser: "Chrome",
      operatingSystem: "iOS",
      screenSize: "390x844",
    },
    referrer: "https://google.com",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "spring",
    landingPage: "/",
    ...overrides,
  }
}

describe("tracking platform foundation", () => {
  it("supports anonymous visitor, known identity merge, session resume, and expiration", () => {
    const manager = new TrackingManager()

    const session = manager.startSession({
      context: sampleContext(),
    })

    expect(session.isAnonymous).toBe(true)

    const resumed = manager.resumeSession(session.sessionId)
    expect(resumed?.isActive).toBe(true)

    const merged = manager.mergeIdentity({
      sourceVisitorId: session.visitorId,
      targetCustomerId: "cust_1",
    })

    expect(merged?.isAnonymous).toBe(false)
    expect(merged?.customerId).toBe("cust_1")

    manager.expireSessions(new Date(Date.now() + 31 * 60 * 1000))
    const sessionsReadModel = manager.getActiveSessionsReadModel()
    expect(sessionsReadModel.payload.totalActiveSessions).toBe(0)
  })

  it("runs validation, deduplication, enrichment, canonical mapping, queue, and dispatch", async () => {
    const dispatcher = new InMemoryTrackingDispatcher()
    const manager = new TrackingManager({ dispatcher })
    const duplicateContext = sampleContext({ timestamp: "2026-06-19T12:00:00.000Z" })

    const session = manager.startSession({
      context: sampleContext(),
    })

    const accepted = manager.trackEvent({
      sessionId: session.sessionId,
      eventId: "evt_1",
      name: "page_viewed",
      context: duplicateContext,
      payload: {},
    })

    expect(accepted.accepted).toBe(true)

    const duplicate = manager.trackEvent({
      sessionId: session.sessionId,
      eventId: "evt_1",
      name: "page_viewed",
      context: duplicateContext,
      payload: {},
    })

    expect(duplicate.accepted).toBe(false)
    expect(duplicate.duplicate).toBe(true)

    const dispatchResult = await manager.dispatchQueue()
    expect(dispatchResult.dispatched).toBe(1)
    expect(dispatchResult.failed).toBe(0)

    const recent = manager.getRecentEventsReadModel()
    expect(recent.payload.events[0]?.payload.timezone).toBe("Asia/Riyadh")
  })

  it("supports retry and failure handling in dispatch queue", async () => {
    const dispatcher = new InMemoryTrackingDispatcher()
    const manager = new TrackingManager({ dispatcher })

    const session = manager.startSession({
      context: sampleContext(),
    })

    manager.trackEvent({
      sessionId: session.sessionId,
      eventId: "evt_fail",
      name: "banner_clicked",
      context: sampleContext(),
      payload: {},
    })

    dispatcher.setFailureMode(["evt_fail"])

    const firstDispatch = await manager.dispatchQueue({
      maxRetries: 2,
      baseDelayMs: 0,
      backoffFactor: 1,
    })
    expect(firstDispatch.failed).toBe(1)

    dispatcher.setFailureMode([])
    const secondDispatch = await manager.dispatchQueue({
      maxRetries: 2,
      baseDelayMs: 0,
      backoffFactor: 1,
    })
    expect(secondDispatch.dispatched).toBe(1)
    expect(secondDispatch.failed).toBe(0)
  })

  it("builds read models for live visitors, funnels, top products, and abandoned carts", () => {
    const manager = new TrackingManager()

    const session = manager.startSession({
      context: sampleContext(),
    })

    manager.trackEvent({
      sessionId: session.sessionId,
      name: "page_viewed",
      context: sampleContext(),
      payload: {},
    })

    manager.trackEvent({
      sessionId: session.sessionId,
      name: "product_viewed",
      context: sampleContext(),
      payload: { productId: "sku_1" },
    })

    manager.trackEvent({
      sessionId: session.sessionId,
      name: "add_to_cart",
      context: sampleContext(),
      payload: { productId: "sku_1" },
    })

    const liveVisitors = manager.getLiveVisitorsReadModel()
    expect(liveVisitors.payload.totalLiveVisitors).toBe(1)

    const funnels = manager.getCurrentFunnelsReadModel()
    expect(funnels.payload.steps.find((step) => step.step === "product_viewed")?.count).toBe(1)

    const topProducts = manager.getTopProductsReadModel()
    expect(topProducts.payload.products[0]?.productId).toBe("sku_1")

    const abandoned = manager.getAbandonedCartsReadModel()
    expect(abandoned.payload.carts.length).toBe(1)
  })

  it("stores and returns tracking consent contracts", () => {
    const manager = new TrackingManager()

    const session = manager.startSession({
      context: sampleContext(),
    })

    manager.setConsent(session.visitorId, {
      status: "partial",
      categories: {
        analytics: true,
        marketing: false,
        personalization: true,
      },
      updatedAt: new Date().toISOString(),
    })

    const consent = manager.getConsent(session.visitorId)
    expect(consent?.status).toBe("partial")
    expect(consent?.categories.analytics).toBe(true)
  })
})
