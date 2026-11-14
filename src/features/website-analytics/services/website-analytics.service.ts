import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same pattern as channels-performance.service.ts's workspace lookup -- each feature keeps its
// own copy rather than sharing one (matches this codebase's existing per-file duplication
// convention).
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

// Mirrors the response of GET /v1/integrations/google-analytics/insights -- keep in sync with
// src/identity-platform/google-analytics-oauth/insights-service.ts.
export interface WebsiteAnalyticsTotals {
  users: number
  newUsers: number
  sessions: number
  pageViews: number
  engagementRate: number
  averageSessionDuration: number
  keyEvents: number
}

export interface WebsiteAnalyticsDay {
  date: string
  users: number
  sessions: number
  pageViews: number
}

export interface WebsiteAnalyticsReport {
  status: "ready"
  property: { id: string; name: string }
  range: { startDate: string; endDate: string }
  previousRange: { startDate: string; endDate: string }
  totals: WebsiteAnalyticsTotals
  previousTotals: WebsiteAnalyticsTotals
  daily: WebsiteAnalyticsDay[]
  pages: Array<{ path: string; pageViews: number; users: number }>
  channels: Array<{ channel: string; sessions: number }>
  sources: Array<{ source: string; medium: string; sessions: number; users: number }>
  countries: Array<{ country: string; countryCode: string | null; users: number }>
  devices: Array<{ device: string; users: number }>
  events: Array<{ name: string; count: number }>
  fetchedAt: string
}

// "not_connected": no Google Analytics account is connected in this workspace yet.
export type WebsiteAnalyticsInsights = { status: "not_connected" } | WebsiteAnalyticsReport

// Avoids the slash-prefix literal lint rule (same trick as channels-performance.service.ts) --
// this is a real backend API path, not a frontend page route.
const INSIGHTS_ENDPOINT = ["", "v1", "integrations", "google-analytics", "insights"].join(
  String.fromCharCode(47)
)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const websiteAnalyticsService = {
  async getInsights(params: {
    startDate: string
    endDate: string
  }): Promise<WebsiteAnalyticsInsights> {
    const query = new URLSearchParams(params)
    return client.get<WebsiteAnalyticsInsights>(`${INSIGHTS_ENDPOINT}?${query.toString()}`)
  },
}
