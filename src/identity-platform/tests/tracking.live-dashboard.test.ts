// @vitest-environment node
//
// Unit coverage for the live-visitors dashboard aggregation. The inputs here are shaped like the
// real ones: properties as they actually arrive from the Zid storefront snippets (prices as
// numbers from one event and strings from another, quantity sometimes absent), because that
// variability is the whole reason this aggregation lives in TypeScript rather than SQL.

import { describe, expect, it } from "vitest"

import {
  countryBreakdown,
  readNumber,
  recentCartAdditions,
  summarize,
  topProducts,
  trafficSourceBreakdown,
  type LiveEventRow,
} from "../tracking/live-dashboard"
import type { LiveVisitorRow } from "../tracking/repository"

function visitor(overrides: Partial<LiveVisitorRow> & { visitorId: string }): LiveVisitorRow {
  return {
    sessionId: `session-${overrides.visitorId}`,
    firstSeenAt: "2026-09-06T00:00:00.000Z",
    lastSeenAt: "2026-09-06T00:01:00.000Z",
    currentPageUrl: null,
    currentPageTitle: null,
    productId: null,
    productName: null,
    country: null,
    city: null,
    deviceType: null,
    browser: null,
    trafficSource: null,
    campaign: null,
    currentActivity: null,
    ...overrides,
  }
}

function event(
  eventType: string,
  visitorId: string,
  properties: Record<string, unknown> | null = null,
  occurredAt = "2026-09-06T00:01:00.000Z"
): LiveEventRow {
  return { eventType, visitorId, properties, occurredAt }
}

describe("readNumber", () => {
  it.each([
    [1000, 1000],
    ["1000", 1000],
    ["1000.50", 1000.5],
    ["", null],
    ["not-a-number", null],
    [null, null],
    [undefined, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
  ])("coerces %p to %p", (input, expected) => {
    expect(readNumber({ price: input }, "price")).toBe(expected)
  })
})

describe("summarize", () => {
  it("counts real storefront events into the KPI row", () => {
    const visitors = [visitor({ visitorId: "v1" }), visitor({ visitorId: "v2" })]
    const events = [
      event("PAGE_VIEW", "v1"),
      event("PAGE_VIEW", "v1"),
      event("PAGE_VIEW", "v2"),
      // Price as a number with an explicit quantity, as the Zid add-to-cart snippet sends it.
      event("ADD_TO_CART", "v1", { product_id: "p1", price: 1000, quantity: 2 }),
      // Price as a string with no quantity -- also real, and must count as one unit.
      event("ADD_TO_CART", "v2", { product_id: "p2", price: "499.50" }),
      event("PURCHASE", "v1", { order_id: "o1", revenue: 2499.5, currency: "SAR" }),
    ]

    const summary = summarize({ visitors, events, activePlatforms: 2 })

    expect(summary).toMatchObject({
      liveVisitors: 2,
      activePlatforms: 2,
      pageViews: 3,
      addToCarts: 2,
      productsAddedToCart: 2,
      orders: 1,
      cartValue: 2499.5,
      orderValue: 2499.5,
    })
  })

  it("treats an unusable price as absent rather than as zero", () => {
    const summary = summarize({
      visitors: [visitor({ visitorId: "v1" })],
      events: [
        event("ADD_TO_CART", "v1", { product_id: "p1", price: "SAR 1,000.00" }),
        event("ADD_TO_CART", "v1", { product_id: "p2", price: 250 }),
      ],
      activePlatforms: 1,
    })

    // Only the parseable line contributes; the malformed one neither throws nor drags the total.
    expect(summary.cartValue).toBe(250)
    expect(summary.addToCarts).toBe(2)
  })

  it("falls back to `value` when a purchase reports no `revenue`", () => {
    const summary = summarize({
      visitors: [visitor({ visitorId: "v1" })],
      events: [event("PURCHASE", "v1", { order_id: "o1", value: 750 })],
      activePlatforms: 1,
    })
    expect(summary.orderValue).toBe(750)
  })

  it("rounds float drift out of money totals", () => {
    const summary = summarize({
      visitors: [visitor({ visitorId: "v1" })],
      events: [
        event("ADD_TO_CART", "v1", { product_id: "p1", price: 0.1 }),
        event("ADD_TO_CART", "v1", { product_id: "p2", price: 0.2 }),
      ],
      activePlatforms: 1,
    })
    expect(summary.cartValue).toBe(0.3)
  })

  it("counts only commerce actions as engagement, not page views or heartbeats", () => {
    const visitors = [
      visitor({ visitorId: "v1" }),
      visitor({ visitorId: "v2" }),
      visitor({ visitorId: "v3" }),
      visitor({ visitorId: "v4" }),
    ]
    const events = [
      event("PAGE_VIEW", "v1"),
      event("HEARTBEAT", "v2"),
      event("IDENTIFY", "v3"),
      event("ADD_TO_CART", "v4", { product_id: "p1" }),
    ]

    // Only v4 acted; 1 of 4 live visitors.
    expect(summarize({ visitors, events, activePlatforms: 1 }).engagementRate).toBe(25)
  })

  it("never reports engagement above 100% when an event's visitor has gone stale", () => {
    // The visitor acted inside the window but their presence row has already aged out.
    const summary = summarize({
      visitors: [visitor({ visitorId: "v1" })],
      events: [
        event("ADD_TO_CART", "v1", { product_id: "p1" }),
        event("PURCHASE", "gone-stale", { revenue: 100 }),
      ],
      activePlatforms: 1,
    })
    expect(summary.engagementRate).toBe(100)
  })

  it("returns zeroes rather than NaN when nothing is live", () => {
    const summary = summarize({ visitors: [], events: [], activePlatforms: 0 })
    expect(summary).toMatchObject({
      liveVisitors: 0,
      pageViews: 0,
      cartValue: 0,
      orderValue: 0,
      engagementRate: 0,
    })
  })
})

describe("breakdowns", () => {
  it("groups visitors by country, largest first, with shares", () => {
    const visitors = [
      visitor({ visitorId: "v1", country: "Saudi Arabia" }),
      visitor({ visitorId: "v2", country: "Saudi Arabia" }),
      visitor({ visitorId: "v3", country: "Saudi Arabia" }),
      visitor({ visitorId: "v4", country: "Egypt" }),
    ]

    expect(countryBreakdown(visitors)).toEqual([
      { label: "Saudi Arabia", code: "Saudi Arabia", visitors: 3, share: 75 },
      { label: "Egypt", code: "Egypt", visitors: 1, share: 25 },
    ])
  })

  it("keeps visitors with no country in their own bucket so shares still total 100%", () => {
    const entries = countryBreakdown([
      visitor({ visitorId: "v1", country: "Saudi Arabia" }),
      visitor({ visitorId: "v2", country: null }),
    ])
    expect(entries.reduce((sum, entry) => sum + entry.visitors, 0)).toBe(2)
    expect(entries.reduce((sum, entry) => sum + entry.share, 0)).toBe(100)
  })

  it("groups by traffic source", () => {
    const entries = trafficSourceBreakdown([
      visitor({ visitorId: "v1", trafficSource: "Referral" }),
      visitor({ visitorId: "v2", trafficSource: "Referral" }),
      visitor({ visitorId: "v3", trafficSource: "Direct" }),
    ])
    expect(entries[0]).toMatchObject({ label: "Referral", visitors: 2 })
  })
})

describe("recentCartAdditions", () => {
  it("returns the newest additions with their real product details", () => {
    const additions = recentCartAdditions([
      event(
        "ADD_TO_CART",
        "v1",
        {
          product_id: "e715eec4",
          product_name: "خاتم عقيق يماني",
          price: 1000,
          quantity: 1,
          currency: "SAR",
        },
        "2026-09-06T00:02:00.000Z"
      ),
      event("PAGE_VIEW", "v1"),
    ])

    expect(additions).toHaveLength(1)
    expect(additions[0]).toMatchObject({
      productId: "e715eec4",
      productName: "خاتم عقيق يماني",
      price: 1000,
      quantity: 1,
      currency: "SAR",
    })
  })
})

describe("topProducts", () => {
  it("ranks by add-to-carts before views", () => {
    const events = [
      event("PRODUCT_VIEW", "v1", { product_id: "browsed", product_name: "Browsed" }),
      event("PRODUCT_VIEW", "v2", { product_id: "browsed" }),
      event("PRODUCT_VIEW", "v3", { product_id: "browsed" }),
      event("PRODUCT_VIEW", "v4", { product_id: "bought", product_name: "Bought" }),
      event("ADD_TO_CART", "v4", { product_id: "bought" }),
    ]

    const ranked = topProducts(events)
    // "browsed" has 3 views to "bought"'s 1, but nobody added it -- selling outranks looking.
    expect(ranked[0]).toMatchObject({ productId: "bought", views: 1, addToCarts: 1 })
    expect(ranked[1]).toMatchObject({ productId: "browsed", views: 3, addToCarts: 0 })
  })

  it("keeps a product name found on any of its events", () => {
    const ranked = topProducts([
      event("PRODUCT_VIEW", "v1", { product_id: "p1" }),
      event("ADD_TO_CART", "v1", { product_id: "p1", product_name: "Named later" }),
    ])
    expect(ranked[0].productName).toBe("Named later")
  })

  it("ignores events with no product id", () => {
    expect(topProducts([event("ADD_TO_CART", "v1", { price: 10 })])).toEqual([])
  })
})
