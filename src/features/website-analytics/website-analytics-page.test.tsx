// @vitest-environment jsdom
//
// Renders the Website analytics page against a stubbed insights endpoint: the answer of an
// account with no Google Analytics, a full report, and a connection Google no longer accepts.

import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@/lib/app-errors"
import { ROUTES } from "@/constants/routes"

import type {
  WebsiteAnalyticsInsights,
  WebsiteAnalyticsReport,
} from "./services/website-analytics.service"

const getInsights = vi.fn()

// A page of the visited site, as Google reports it.
const PRICING_PAGE = `${ROUTES.home}pricing`

vi.mock("./services/website-analytics.service", () => ({
  websiteAnalyticsService: {
    getInsights: (query: unknown) => getInsights(query) as Promise<WebsiteAnalyticsInsights>,
  },
}))

// The chart measures its box with ResizeObserver, which jsdom doesn't have.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

const { default: WebsiteAnalyticsPage } =
  await import("../../app/(layout-pages)/website-analytics/WebsiteAnalyticsPage")

function report(): WebsiteAnalyticsReport {
  return {
    status: "ready",
    property: { id: "properties/123", name: "madar.my" },
    range: { startDate: "2026-03-01", endDate: "2026-03-03" },
    previousRange: { startDate: "2026-02-26", endDate: "2026-02-28" },
    totals: {
      users: 3120,
      newUsers: 2540,
      sessions: 5580,
      pageViews: 13300,
      engagementRate: 0.6234,
      averageSessionDuration: 94.4,
      keyEvents: 87,
    },
    previousTotals: {
      users: 2800,
      newUsers: 2300,
      sessions: 4100,
      pageViews: 11000,
      engagementRate: 0.65,
      averageSessionDuration: 80,
      // Nothing before to compare with.
      keyEvents: 0,
    },
    // 2026-03-02 is missing: nobody visited.
    daily: [
      { date: "2026-03-01", users: 10, sessions: 12, pageViews: 30 },
      { date: "2026-03-03", users: 20, sessions: 25, pageViews: 61 },
    ],
    pages: [{ path: PRICING_PAGE, pageViews: 1800, users: 900 }],
    channels: [
      { channel: "Paid Social", sessions: 2100 },
      { channel: "Some New Channel", sessions: 5 },
    ],
    sources: [
      { source: "snapchat", medium: "paid_social", sessions: 1900, users: 1500 },
      { source: "(direct)", medium: "(none)", sessions: 1300, users: 1000 },
    ],
    countries: [
      { country: "Saudi Arabia", countryCode: "SA", users: 2600 },
      { country: "(not set)", countryCode: null, users: 20 },
    ],
    devices: [{ device: "mobile", users: 2500 }],
    events: [
      { name: "generate_lead", count: 87 },
      { name: "madar_custom_event", count: 12 },
    ],
    fetchedAt: "2026-03-04T08:00:00.000Z",
  }
}

beforeEach(() => {
  getInsights.mockReset()
})

describe("WebsiteAnalyticsPage", () => {
  it("offers to connect Google Analytics when the account has none", async () => {
    getInsights.mockResolvedValue({ status: "not_connected" })
    render(<WebsiteAnalyticsPage />)

    expect(await screen.findByText("اربط Google Analytics لترى زيارات موقعك")).toBeTruthy()
    const link = screen.getByRole("link", { name: "ربط Google Analytics" })
    expect(link.getAttribute("href")).toBe(ROUTES.integrationsNew)
    // No date filter until there is something to filter.
    expect(screen.queryByText("آخر 28 يوماً")).toBeNull()
  })

  it("shows the numbers, pages, sources, countries, devices and events of a report", async () => {
    getInsights.mockResolvedValue(report())
    render(<WebsiteAnalyticsPage />)

    expect(await screen.findByText("بيانات Google Analytics للموقع: madar.my")).toBeTruthy()
    // The default period is the last 28 days.
    const query = getInsights.mock.calls[0][0] as { startDate: string; endDate: string }
    const days = (Date.parse(query.endDate) - Date.parse(query.startDate)) / 86_400_000 + 1
    expect(days).toBe(28)

    for (const value of ["3,120", "5,580", "13,300", "62.3%", "1:34"]) {
      expect(screen.getByText(value)).toBeTruthy()
    }
    // Up 11.4% on the period before; key events had nothing before to compare with.
    expect(screen.getByText("+11.4%")).toBeTruthy()
    expect(screen.getByText("-4.1%")).toBeTruthy()
    expect(screen.getByText("لا توجد بيانات سابقة للمقارنة")).toBeTruthy()

    expect(screen.getByText(PRICING_PAGE)).toBeTruthy()
    // Google's English names are shown in the page's own words; unknown ones as they came.
    expect(screen.getByText("تواصل اجتماعي مدفوع")).toBeTruthy()
    expect(screen.getByText("Some New Channel")).toBeTruthy()
    expect(screen.getByText("snapchat / paid_social")).toBeTruthy()
    expect(screen.getByText("زيارات مباشرة")).toBeTruthy()
    expect(screen.getByText("جوال")).toBeTruthy()
    expect(screen.getByText("عميل محتمل")).toBeTruthy()
    expect(screen.getByText("generate_lead")).toBeTruthy()
    expect(screen.getByText("madar_custom_event")).toBeTruthy()
    expect(screen.getByText("غير محدد")).toBeTruthy()
  })

  it("asks to reconnect when Google no longer accepts the connection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    getInsights.mockRejectedValue(
      new AppError("unknown", {
        code: "GOOGLE_ANALYTICS_RECONNECT_REQUIRED",
        message: "Reconnect Google Analytics.",
        status: 409,
      })
    )
    render(<WebsiteAnalyticsPage />)

    expect(
      await screen.findByText("انتهت صلاحية ربط Google Analytics. أعد الربط لتظهر البيانات.")
    ).toBeTruthy()
    expect(screen.getByRole("link", { name: "فتح صفحة الربط" }).getAttribute("href")).toBe(
      ROUTES.integrations
    )
  })
})
