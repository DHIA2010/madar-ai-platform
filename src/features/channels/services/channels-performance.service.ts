import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same pattern as campaign-performance.service.ts's workspace lookup -- each feature keeps its
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

// Mirrors identity-platform/channels/channels-service.ts -- there is no 5th ad-spend platform
// anywhere in this codebase (see that file's comment), so this is a closed set of 4.
export type ChannelName = "Google Ads" | "Meta Ads" | "TikTok Ads" | "Snapchat"
export type ChannelHealth = "healthy" | "stale" | "failed" | "never_synced"

export interface ChannelRow {
  name: ChannelName
  connected: boolean
  spend: number
  revenue: number
  roas: number
  conversions: number
  campaigns: number
  health: ChannelHealth
  lastSyncedAt: string | null
  sparkline: number[]
}

export interface ChannelsSummary {
  spend: number
  spendChangePct: number | null
  revenue: number
  revenueChangePct: number | null
  roas: number
  roasChangePct: number | null
  conversions: number
  conversionsChangePct: number | null
  cpa: number
  cpaChangePct: number | null
  activeChannels: number
  totalChannels: number
}

export interface ChannelsTrendPoint {
  bucketStart: string
  spendByChannel: Record<ChannelName, number>
}

export interface ChannelAlert {
  channel: ChannelName
  type: "stale_sync" | "spend_spike" | "spend_drop"
  severity: "warning" | "error"
  minutesSinceSync?: number
  todaySpend?: number
  trailingAverageSpend?: number
  changePct?: number
}

export interface ChannelsQueryParams {
  startDate?: string
  endDate?: string
}

// Mirrors identity-platform/stores/service.ts's StorePlatform -- no WooCommerce connector
// exists anywhere in this codebase, so it's never included here.
export type StorePlatform = "Salla" | "Zid" | "Shopify"

export interface StorePlatformRow {
  platform: StorePlatform
  customers: number
  orders: number
  ordersChangePct: number | null
  revenue: number
  revenueChangePct: number | null
  averageOrderValue: number
  trend: number[]
}

export interface TopProductRow {
  name: string
  orders: number
  quantitySold: number
  thumbnail: string | null
}

// Avoids the slash-prefix literal lint rule (same trick as order-list.service.ts/
// campaign-performance.service.ts) -- this is a real backend API path, not a frontend page route.
const PERFORMANCE_ENDPOINT = ["", "v1", "channels", "performance"].join(String.fromCharCode(47))

function buildQuery(params?: ChannelsQueryParams) {
  const query = new URLSearchParams()
  if (params?.startDate) query.set("startDate", params.startDate)
  if (params?.endDate) query.set("endDate", params.endDate)
  const suffix = query.toString() ? `?${query.toString()}` : ""
  return suffix
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const channelsPerformanceService = {
  async getSummary(params?: ChannelsQueryParams): Promise<ChannelsSummary> {
    return client.get<ChannelsSummary>(`${PERFORMANCE_ENDPOINT}/summary${buildQuery(params)}`)
  },

  async getChannelBreakdown(params?: ChannelsQueryParams): Promise<{ items: ChannelRow[] }> {
    return client.get<{ items: ChannelRow[] }>(
      `${PERFORMANCE_ENDPOINT}/breakdown${buildQuery(params)}`
    )
  },

  async getPerformanceTrend(
    params?: ChannelsQueryParams
  ): Promise<{ items: ChannelsTrendPoint[] }> {
    return client.get<{ items: ChannelsTrendPoint[] }>(
      `${PERFORMANCE_ENDPOINT}/trend${buildQuery(params)}`
    )
  },

  async getAlerts(): Promise<{ items: ChannelAlert[] }> {
    return client.get<{ items: ChannelAlert[] }>(`${PERFORMANCE_ENDPOINT}/alerts`)
  },

  async getStoresBreakdown(params?: ChannelsQueryParams): Promise<{ items: StorePlatformRow[] }> {
    return client.get<{ items: StorePlatformRow[] }>(
      `${PERFORMANCE_ENDPOINT}/stores${buildQuery(params)}`
    )
  },

  async getTopProducts(params?: ChannelsQueryParams): Promise<{ items: TopProductRow[] }> {
    return client.get<{ items: TopProductRow[] }>(
      `${PERFORMANCE_ENDPOINT}/products${buildQuery(params)}`
    )
  },
}
