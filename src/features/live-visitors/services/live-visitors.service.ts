import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) {
      return null
    }

    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

// Mirrors the response of GET /v1/tracking/live-dashboard -- keep in sync with
// src/identity-platform/tracking/service.ts's LiveDashboard.
export interface LiveVisitorRecord {
  visitorId: string
  sessionId: string
  firstSeenAt: string
  lastSeenAt: string
  currentPageUrl: string | null
  currentPageTitle: string | null
  productId: string | null
  productName: string | null
  country: string | null
  city: string | null
  deviceType: string | null
  browser: string | null
  trafficSource: string | null
  campaign: string | null
  currentActivity: string | null
}

export interface LiveSummary {
  liveVisitors: number
  activePlatforms: number
  pageViews: number
  addToCarts: number
  productsAddedToCart: number
  orders: number
  cartValue: number
  orderValue: number
  engagementRate: number
}

export interface LiveBreakdownEntry {
  label: string
  code: string | null
  visitors: number
  share: number
}

export interface LiveCartAddition {
  productId: string | null
  productName: string | null
  price: number | null
  quantity: number | null
  currency: string | null
  occurredAt: string
}

export interface LiveTopProduct {
  productId: string
  productName: string | null
  views: number
  addToCarts: number
}

export interface LiveDashboardRecord {
  windowMinutes: number
  summary: LiveSummary
  countries: LiveBreakdownEntry[]
  trafficSources: LiveBreakdownEntry[]
  recentCartAdditions: LiveCartAddition[]
  topProducts: LiveTopProduct[]
  visitors: LiveVisitorRecord[]
}

const LIVE_DASHBOARD_ENDPOINT = ["", "v1", "tracking", "live-dashboard"].join(
  String.fromCharCode(47)
)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const liveVisitorsService = {
  async getDashboard(): Promise<LiveDashboardRecord> {
    return client.get<LiveDashboardRecord>(LIVE_DASHBOARD_ENDPOINT)
  },
}
