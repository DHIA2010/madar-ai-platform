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

export type CampaignPlatform = "google_ads" | "meta_ads" | "snapchat_ads" | "tiktok_ads"
export type CampaignSource = "native" | "imported"

export interface CampaignRecord {
  id: string
  displayName: string
  source: CampaignSource
  platform: CampaignPlatform | null
  status: string
  createdAt: string
}

const CAMPAIGNS_ENDPOINT = ["", "v1", "campaigns"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const campaignPickerService = {
  async listCampaigns(): Promise<CampaignRecord[]> {
    const response = await client.get<{ items: CampaignRecord[] }>(CAMPAIGNS_ENDPOINT)
    return response.items
  },

  async importCampaignsFromPlatform(
    platform: CampaignPlatform
  ): Promise<{ imported: number; campaigns: CampaignRecord[] }> {
    return client.post<
      { platform: CampaignPlatform },
      { imported: number; campaigns: CampaignRecord[] }
    >(`${CAMPAIGNS_ENDPOINT}/sync`, { platform })
  },
}
