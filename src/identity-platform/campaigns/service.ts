import { IdentityError } from "../application/errors/IdentityError"

import { CampaignRepository, type RawPlatformCampaign } from "./repository"
import {
  CAMPAIGN_PLATFORMS,
  type CampaignPlatform,
  type CampaignStatus,
  type CampaignView,
} from "./types"

const CAMPAIGN_ERRORS = {
  notFound: () => new IdentityError("CAMPAIGN_NOT_FOUND", 404, "business", "Campaign not found."),
  invalidPlatform: (platform: string) =>
    new IdentityError(
      "CAMPAIGN_INVALID_PLATFORM",
      422,
      "validation",
      `Unknown ad platform: ${platform}`
    ),
}

// Maps each platform's own status vocabulary onto our fixed active/paused/archived set.
// A status we don't recognize defaults to "active" rather than throwing -- an import
// should never fail because one platform introduced a new status value.
function mapPlatformStatus(rawStatus: string | null): CampaignStatus {
  if (!rawStatus) return "active"
  const normalized = rawStatus.toUpperCase()
  if (["REMOVED", "DELETED", "ARCHIVED"].includes(normalized)) return "archived"
  if (["PAUSED", "DISABLE", "INACTIVE"].includes(normalized)) return "paused"
  return "active"
}

export class CampaignService {
  constructor(private readonly repository: CampaignRepository) {}

  async list(organizationId: string, workspaceId: string | null): Promise<CampaignView[]> {
    return this.repository.list(organizationId, workspaceId)
  }

  async listImported(organizationId: string, platform?: CampaignPlatform): Promise<CampaignView[]> {
    return this.repository.listImported(organizationId, platform)
  }

  async getById(organizationId: string, id: string): Promise<CampaignView> {
    const campaign = await this.repository.findById(organizationId, id)
    if (!campaign) throw CAMPAIGN_ERRORS.notFound()
    return campaign
  }

  async createNative(
    organizationId: string,
    workspaceId: string | null,
    input: {
      displayName: string
      objective?: string | null
      budgetCurrency?: string | null
      budgetAmount?: number | null
      startDate?: string | null
      endDate?: string | null
    }
  ): Promise<CampaignView> {
    return this.repository.createNative({ organizationId, workspaceId, ...input })
  }

  async importFromPlatform(
    organizationId: string,
    input: { platform: string; connectionId?: string }
  ): Promise<{ imported: number; campaigns: CampaignView[] }> {
    if (!CAMPAIGN_PLATFORMS.includes(input.platform as CampaignPlatform)) {
      throw CAMPAIGN_ERRORS.invalidPlatform(input.platform)
    }
    const platform = input.platform as CampaignPlatform

    const rawCampaigns: RawPlatformCampaign[] = await this.repository.fetchPlatformCampaigns(
      organizationId,
      platform,
      input.connectionId
    )

    const campaigns: CampaignView[] = []
    for (const raw of rawCampaigns) {
      const campaign = await this.repository.upsertImported({
        organizationId,
        workspaceId: raw.workspaceId,
        platform,
        advertisingAccountId: raw.advertisingAccountId,
        externalCampaignId: raw.externalCampaignId,
        displayName: raw.displayName,
        status: mapPlatformStatus(raw.rawStatus),
        objective: raw.objective,
        startDate: raw.startDate,
        endDate: raw.endDate,
      })
      campaigns.push(campaign)
    }

    return { imported: campaigns.length, campaigns }
  }
}
