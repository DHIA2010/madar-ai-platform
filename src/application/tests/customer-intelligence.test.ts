import { beforeEach, describe, expect, it } from "vitest"

import {
  createCustomerIntelligenceRepository,
  resetCustomerIntelligenceRepositoryState,
} from "@/infrastructure"

import { CustomerIntelligenceApplicationService } from "../services"

function createService() {
  return new CustomerIntelligenceApplicationService(createCustomerIntelligenceRepository())
}

describe("customer intelligence foundation", () => {
  beforeEach(() => {
    resetCustomerIntelligenceRepositoryState()
  })

  it("supports session lifecycle and visitor history", async () => {
    const service = createService()

    const session = await service.startSession({
      visitorId: "v_1",
      startedAt: "2026-01-01T10:00:00.000Z",
      entryPage: "/",
      source: "google",
      medium: "cpc",
      campaign: "spring_sale",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
    })

    await service.trackEvent({
      eventId: "evt_1",
      visitorId: "v_1",
      sessionId: session.payload.sessionId,
      timestamp: "2026-01-01T10:01:00.000Z",
      eventName: "page_view",
      page: "/",
      source: "google",
      medium: "cpc",
      campaign: "spring_sale",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
      metadata: {},
    })

    const ended = await service.endSession({
      sessionId: session.payload.sessionId,
      endedAt: "2026-01-01T10:05:00.000Z",
      exitPage: "/products",
    })

    expect(ended?.payload.isActive).toBe(false)
    expect(ended?.payload.exitPage).toBe("/products")

    const history = await service.getVisitorHistory("v_1")
    expect(history?.payload.sessions).toHaveLength(1)
    expect(history?.payload.events).toHaveLength(1)
    expect(history?.payload.pageViews).toHaveLength(1)
  })

  it("attaches identity and merges visitor history into a single journey", async () => {
    const service = createService()

    const sessionOne = await service.startSession({
      visitorId: "anon_a",
      startedAt: "2026-01-02T09:00:00.000Z",
      entryPage: "/landing-a",
      source: "meta",
      medium: "paid-social",
      campaign: "launch",
      device: "desktop",
      browser: "safari",
      country: "SA",
      city: "Jeddah",
    })

    await service.trackEvent({
      eventId: "evt_a",
      visitorId: "anon_a",
      sessionId: sessionOne.payload.sessionId,
      timestamp: "2026-01-02T09:02:00.000Z",
      eventName: "add_to_cart",
      page: "/product/sku-1",
      source: "meta",
      medium: "paid-social",
      campaign: "launch",
      device: "desktop",
      browser: "safari",
      country: "SA",
      city: "Jeddah",
      metadata: { productId: "sku-1" },
    })

    await service.attachIdentity({
      visitorId: "anon_a",
      attachedAt: "2026-01-02T09:05:00.000Z",
      externalId: "cust_100",
      email: "customer@example.com",
    })

    const sessionTwo = await service.startSession({
      visitorId: "anon_b",
      startedAt: "2026-01-03T12:00:00.000Z",
      entryPage: "/landing-b",
      source: "google",
      medium: "cpc",
      campaign: "launch",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Dammam",
    })

    await service.trackEvent({
      eventId: "evt_b",
      visitorId: "anon_b",
      sessionId: sessionTwo.payload.sessionId,
      timestamp: "2026-01-03T12:10:00.000Z",
      eventName: "purchase",
      page: "/checkout/success",
      source: "google",
      medium: "cpc",
      campaign: "launch",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Dammam",
      metadata: { productId: "sku-1", revenue: 220 },
    })

    await service.attachIdentity({
      visitorId: "anon_b",
      attachedAt: "2026-01-03T12:11:00.000Z",
      externalId: "cust_100",
      email: "customer@example.com",
    })

    const customerJourney = await service.getJourney({ customerId: "cust_100" })
    expect([...(customerJourney?.payload.visitorIds ?? [])].sort()).toEqual(["anon_a", "anon_b"])
    expect(customerJourney?.payload.events.map((event) => event.eventId).sort()).toEqual([
      "evt_a",
      "evt_b",
    ])

    const journeyA = await service.getJourney({ visitorId: "anon_a" })
    const journeyB = await service.getJourney({ visitorId: "anon_b" })
    expect(journeyA?.payload.journeyId).toBe(journeyB?.payload.journeyId)

    const timeline = await service.getCustomerTimeline("cust_100")
    expect(timeline?.payload.timeline.some((entry) => entry.action === "identity_attached")).toBe(
      true
    )
  })

  it("returns journey events in chronological order", async () => {
    const service = createService()

    const session = await service.startSession({
      visitorId: "v_order",
      startedAt: "2026-01-04T10:00:00.000Z",
      entryPage: "/start",
      source: "direct",
      medium: "none",
      campaign: "organic",
      device: "desktop",
      browser: "firefox",
      country: "SA",
      city: "Riyadh",
    })

    await service.trackEvent({
      eventId: "evt_late",
      visitorId: "v_order",
      sessionId: session.payload.sessionId,
      timestamp: "2026-01-04T10:04:00.000Z",
      eventName: "product_view",
      page: "/products/1",
      source: "direct",
      medium: "none",
      campaign: "organic",
      device: "desktop",
      browser: "firefox",
      country: "SA",
      city: "Riyadh",
      metadata: { productId: "sku-2" },
    })

    await service.trackEvent({
      eventId: "evt_early",
      visitorId: "v_order",
      sessionId: session.payload.sessionId,
      timestamp: "2026-01-04T10:01:00.000Z",
      eventName: "page_view",
      page: "/products",
      source: "direct",
      medium: "none",
      campaign: "organic",
      device: "desktop",
      browser: "firefox",
      country: "SA",
      city: "Riyadh",
      metadata: {},
    })

    const journey = await service.getJourney({ visitorId: "v_order" })
    const timestamps = journey?.payload.events.map((event) => event.timestamp) ?? []
    const sorted = [...timestamps].sort((left, right) => left.localeCompare(right))

    expect(timestamps).toEqual(sorted)
  })

  it("maps read models for traffic, attribution, and product interest", async () => {
    const service = createService()

    const session = await service.startSession({
      visitorId: "v_stats",
      startedAt: "2026-01-05T10:00:00.000Z",
      entryPage: "/",
      source: "google",
      medium: "cpc",
      campaign: "ramadan",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
    })

    await service.trackEvent({
      eventId: "evt_imp",
      visitorId: "v_stats",
      sessionId: session.payload.sessionId,
      timestamp: "2026-01-05T10:01:00.000Z",
      eventName: "campaign_impression",
      page: "/",
      source: "google",
      medium: "cpc",
      campaign: "ramadan",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
      metadata: {},
    })

    await service.trackEvent({
      eventId: "evt_clk",
      visitorId: "v_stats",
      sessionId: session.payload.sessionId,
      timestamp: "2026-01-05T10:02:00.000Z",
      eventName: "campaign_click",
      page: "/product/sku-3",
      source: "google",
      medium: "cpc",
      campaign: "ramadan",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
      metadata: {},
    })

    await service.trackEvent({
      eventId: "evt_cart",
      visitorId: "v_stats",
      sessionId: session.payload.sessionId,
      timestamp: "2026-01-05T10:03:00.000Z",
      eventName: "add_to_cart",
      page: "/product/sku-3",
      source: "google",
      medium: "cpc",
      campaign: "ramadan",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
      metadata: { productId: "sku-3" },
    })

    await service.trackEvent({
      eventId: "evt_checkout",
      visitorId: "v_stats",
      sessionId: session.payload.sessionId,
      timestamp: "2026-01-05T10:04:00.000Z",
      eventName: "begin_checkout",
      page: "/checkout",
      source: "google",
      medium: "cpc",
      campaign: "ramadan",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
      metadata: {},
    })

    await service.trackEvent({
      eventId: "evt_purchase",
      visitorId: "v_stats",
      sessionId: session.payload.sessionId,
      timestamp: "2026-01-05T10:05:00.000Z",
      eventName: "purchase",
      page: "/checkout/success",
      source: "google",
      medium: "cpc",
      campaign: "ramadan",
      device: "mobile",
      browser: "chrome",
      country: "SA",
      city: "Riyadh",
      metadata: { productId: "sku-3", revenue: 120 },
    })

    const traffic = await service.getTrafficSources()
    expect(traffic.id).toBe("traffic-sources:all")
    expect(traffic.payload[0]?.source).toBe("google")

    const attribution = await service.getCampaignAttribution()
    expect(attribution.id).toBe("campaign-attribution:all")
    expect(attribution.payload[0]?.impressions).toBe(1)
    expect(attribution.payload[0]?.clicks).toBe(1)
    expect(attribution.payload[0]?.purchases).toBe(1)
    expect(attribution.payload[0]?.revenue).toBe(120)

    const productInterest = await service.getProductInterest()
    expect(productInterest.id).toBe("product-interest:all")
    const skuInterest = productInterest.payload.find((item) => item.productId === "sku-3")
    expect(skuInterest?.purchases).toBe(1)
  })
})
