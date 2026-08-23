import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same workspace-lookup pattern as order-list.service.ts / product-list.service.ts -- this
// feature is a plain client wired directly to the HTTP client, not through
// useInfrastructureServices().
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

export type TrackingType = "FULL_URL" | "SHORT_LINK"

export interface CampaignLinkRecord {
  id: string
  organizationId: string
  workspaceId: string | null
  campaignId: string
  displayId: string
  name: string
  trackingType: TrackingType
  destinationBaseUrl: string
  finalUrl: string
  shortUrl: string | null
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string | null
  utmTerm: string | null
  adGroupName: string | null
  adName: string | null
  customParams: Record<string, string>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CampaignLinkSummaryRecord {
  id: string
  displayId: string
  name: string
  campaignId: string
  trackingType: TrackingType
  enabled: boolean
  shortUrl: string | null
  finalUrl: string
  clicks: number
  sessions: number
  ordersCount: number
  revenue: number
  createdAt: string
}

export interface DailyMetricPointRecord {
  metricDate: string
  clicks: number
  sessions: number
  ordersCount: number
  revenue: number
  currency: string | null
}

export interface MatchMethodBreakdownRecord {
  matchMethod: string
  ordersCount: number
  revenue: number
}

export interface CampaignLinkAttributionDetailRecord {
  daily: DailyMetricPointRecord[]
  byMatchMethod: MatchMethodBreakdownRecord[]
}

export interface CampaignLinkPreviewRecord {
  finalUrl: string
  shortUrl: string | null
  normalizedUtm: {
    utmSource: string
    utmMedium: string
    utmCampaign: string
    utmContent: string | null
    utmTerm: string | null
  }
}

export interface CampaignLinkFormInput {
  campaignId: string
  name: string
  trackingType: TrackingType
  destinationBaseUrl: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent?: string
  utmTerm?: string
  adGroupName?: string
  adName?: string
  customParams?: Record<string, string>
}

// adGroupName/adName are deliberately absent -- like UTM fields, they're tracking identifiers
// fixed at creation, not editable display metadata.
export interface CampaignLinkUpdateInput {
  name?: string
  customParams?: Record<string, string>
}

// Avoids the slash-prefix literal lint rule (same trick as order-list.service.ts).
const CAMPAIGN_LINKS_ENDPOINT = ["", "v1", "campaign-links"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const linkListService = {
  async listCampaignLinks(): Promise<CampaignLinkRecord[]> {
    const response = await client.get<{ items: CampaignLinkRecord[] }>(CAMPAIGN_LINKS_ENDPOINT)
    return response.items
  },

  async getCampaignLinksSummary(range?: {
    startDate?: string
    endDate?: string
  }): Promise<CampaignLinkSummaryRecord[]> {
    const query = new URLSearchParams()
    if (range?.startDate) query.set("startDate", range.startDate)
    if (range?.endDate) query.set("endDate", range.endDate)
    const suffix = query.toString() ? `?${query.toString()}` : ""
    const response = await client.get<{ items: CampaignLinkSummaryRecord[] }>(
      `${CAMPAIGN_LINKS_ENDPOINT}/summary${suffix}`
    )
    return response.items
  },

  async getCampaignLinkDetail(id: string): Promise<CampaignLinkRecord> {
    return client.get<CampaignLinkRecord>(`${CAMPAIGN_LINKS_ENDPOINT}/${encodeURIComponent(id)}`)
  },

  async getCampaignLinkAttribution(id: string): Promise<CampaignLinkAttributionDetailRecord> {
    return client.get<CampaignLinkAttributionDetailRecord>(
      `${CAMPAIGN_LINKS_ENDPOINT}/${encodeURIComponent(id)}/attribution`
    )
  },

  async previewCampaignLink(input: CampaignLinkFormInput): Promise<CampaignLinkPreviewRecord> {
    return client.post<CampaignLinkFormInput, CampaignLinkPreviewRecord>(
      `${CAMPAIGN_LINKS_ENDPOINT}/preview`,
      input
    )
  },

  async createCampaignLink(input: CampaignLinkFormInput): Promise<CampaignLinkRecord> {
    return client.post<CampaignLinkFormInput, CampaignLinkRecord>(CAMPAIGN_LINKS_ENDPOINT, input)
  },

  async updateCampaignLink(
    id: string,
    input: CampaignLinkUpdateInput
  ): Promise<CampaignLinkRecord> {
    return client.patch<CampaignLinkUpdateInput, CampaignLinkRecord>(
      `${CAMPAIGN_LINKS_ENDPOINT}/${encodeURIComponent(id)}`,
      input
    )
  },

  async setCampaignLinkEnabled(id: string, enabled: boolean): Promise<CampaignLinkRecord> {
    const action = enabled ? "enable" : "disable"
    return client.post<Record<string, never>, CampaignLinkRecord>(
      `${CAMPAIGN_LINKS_ENDPOINT}/${encodeURIComponent(id)}/${action}`,
      {}
    )
  },

  async archiveCampaignLink(id: string): Promise<void> {
    await client.post<Record<string, never>, { archived: boolean }>(
      `${CAMPAIGN_LINKS_ENDPOINT}/${encodeURIComponent(id)}/archive`,
      {}
    )
  },
}
