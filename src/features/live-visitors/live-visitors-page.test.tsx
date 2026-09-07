// @vitest-environment jsdom
//
// Renders the live-visitors page against a stubbed dashboard endpoint. The fixture is shaped
// like a real response from GET /v1/tracking/live-dashboard -- including the awkward parts a
// live storefront actually produces: a visitor with no geo at all, a cart line with no price,
// and a product known only by its id.

import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LiveDashboardRecord } from "./services/live-visitors.service"

const getDashboard = vi.fn()

vi.mock("./services/live-visitors.service", () => ({
  liveVisitorsService: { getDashboard: () => getDashboard() as Promise<LiveDashboardRecord> },
}))

// next/font must be stubbed: it is a build-time transform with no runtime implementation.
vi.mock("@/components/design/fonts", () => ({
  tajawal: { className: "font-tajawal" },
}))

const { default: LiveVisitorsPage } =
  await import("../../app/(layout-pages)/live-visitors/LiveVisitorsPage")

function dashboard(overrides: Partial<LiveDashboardRecord> = {}): LiveDashboardRecord {
  return {
    windowMinutes: 5,
    summary: {
      liveVisitors: 2,
      activePlatforms: 1,
      pageViews: 7,
      addToCarts: 1,
      productsAddedToCart: 1,
      orders: 1,
      cartValue: 2000,
      orderValue: 2000,
      engagementRate: 50,
    },
    countries: [
      { label: "Saudi Arabia", code: "Saudi Arabia", visitors: 1, share: 50 },
      { label: "", code: null, visitors: 1, share: 50 },
    ],
    trafficSources: [{ label: "Referral", code: null, visitors: 2, share: 100 }],
    recentCartAdditions: [
      {
        productId: "e715eec4",
        productName: "خاتم عقيق يماني",
        price: 1000,
        quantity: 2,
        currency: "SAR",
        occurredAt: "2026-09-06T00:02:00.000Z",
      },
      {
        productId: "no-price",
        productName: "منتج بدون سعر",
        price: null,
        quantity: null,
        currency: null,
        occurredAt: "2026-09-06T00:01:00.000Z",
      },
    ],
    topProducts: [
      { productId: "e715eec4", productName: "خاتم عقيق يماني", views: 2, addToCarts: 1 },
      { productId: "unnamed-product", productName: null, views: 1, addToCarts: 0 },
    ],
    visitors: [
      {
        visitorId: "v1",
        sessionId: "s1",
        firstSeenAt: "2026-09-06T00:00:00.000Z",
        lastSeenAt: "2026-09-06T00:02:00.000Z",
        currentPageUrl: "https://jail6w.zid.store/products/ring",
        currentPageTitle: null,
        productId: "e715eec4",
        productName: "خاتم عقيق يماني",
        country: "Saudi Arabia",
        city: "Riyadh",
        deviceType: "desktop",
        browser: "Chrome",
        trafficSource: "Referral",
        campaign: null,
        currentActivity: "ADD_TO_CART",
      },
      {
        visitorId: "v2",
        sessionId: "s2",
        firstSeenAt: "2026-09-06T00:01:00.000Z",
        lastSeenAt: "2026-09-06T00:02:00.000Z",
        currentPageUrl: null,
        currentPageTitle: null,
        productId: null,
        productName: null,
        country: null,
        city: null,
        deviceType: "mobile",
        browser: "Safari",
        trafficSource: null,
        campaign: null,
        currentActivity: "PAGE_VIEW",
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  getDashboard.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("LiveVisitorsPage", () => {
  it("renders the KPI row from the dashboard response", async () => {
    getDashboard.mockResolvedValue(dashboard())
    render(<LiveVisitorsPage />)

    expect(await screen.findByText("الزوار المباشرون")).toBeTruthy()
    expect(screen.getByText("مباشر")).toBeTruthy()

    for (const label of [
      "الزوار المباشرون الآن",
      "عدد المنصات النشطة",
      "مشاهدات الصفحات الآن",
      "معدل التفاعل",
      "الطلبات الآن",
      "إضافات للسلة الآن",
      "منتجات أضيفت للسلة",
      "قيمة سلال التسوق الآن",
      "قيمة الطلبات الآن",
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }

    expect(screen.getByText("7")).toBeTruthy()
    expect(screen.getByText("50%")).toBeTruthy()
    expect(screen.getAllByText("SAR 2,000.00").length).toBeGreaterThan(0)
  })

  it("shows a visitor's location, page and device", async () => {
    getDashboard.mockResolvedValue(dashboard())
    render(<LiveVisitorsPage />)

    expect(await screen.findByText("Riyadh، Saudi Arabia")).toBeTruthy()
    // The visitor is on a product page, so the product name is more useful than the path.
    expect(screen.getAllByText("خاتم عقيق يماني").length).toBeGreaterThan(0)
    // A visitor with no geo at all still renders rather than being dropped.
    expect(screen.getByText("موقع غير معروف")).toBeTruthy()
  })

  it("renders a cart line with no price without printing NaN", async () => {
    getDashboard.mockResolvedValue(dashboard())
    render(<LiveVisitorsPage />)

    expect(await screen.findByText("منتج بدون سعر")).toBeTruthy()
    expect(document.body.textContent).not.toContain("NaN")
    expect(document.body.textContent).not.toContain("undefined")
  })

  it("falls back to the product id when a product has no name", async () => {
    getDashboard.mockResolvedValue(dashboard())
    render(<LiveVisitorsPage />)
    expect(await screen.findByText("unnamed-product")).toBeTruthy()
  })

  it("renders empty states rather than blank panels when nothing is live", async () => {
    getDashboard.mockResolvedValue(
      dashboard({
        summary: {
          liveVisitors: 0,
          activePlatforms: 0,
          pageViews: 0,
          addToCarts: 0,
          productsAddedToCart: 0,
          orders: 0,
          cartValue: 0,
          orderValue: 0,
          engagementRate: 0,
        },
        countries: [],
        trafficSources: [],
        recentCartAdditions: [],
        topProducts: [],
        visitors: [],
      })
    )
    render(<LiveVisitorsPage />)

    expect(await screen.findByText("لا يوجد زوار نشطون الآن.")).toBeTruthy()
    expect(screen.getByText("لا توجد إضافات للسلة")).toBeTruthy()
    expect(screen.getByText("لا توجد منتجات بعد")).toBeTruthy()
    expect(document.body.textContent).not.toContain("NaN")
  })

  it("surfaces an error when the first load fails", async () => {
    getDashboard.mockRejectedValue(new Error("تعذر الاتصال"))
    render(<LiveVisitorsPage />)
    expect(await screen.findByText("تعذر الاتصال")).toBeTruthy()
  })

  it("keeps the last good snapshot when a background refresh fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getDashboard.mockResolvedValueOnce(dashboard())
    render(<LiveVisitorsPage />)
    await waitFor(() => expect(screen.getByText("Riyadh، Saudi Arabia")).toBeTruthy())

    // A dashboard someone is watching must not blank out because one poll failed.
    getDashboard.mockRejectedValue(new Error("network blip"))
    await vi.advanceTimersByTimeAsync(16_000)

    expect(screen.getByText("Riyadh، Saudi Arabia")).toBeTruthy()
    expect(screen.queryByText("network blip")).toBeNull()
  })
})
