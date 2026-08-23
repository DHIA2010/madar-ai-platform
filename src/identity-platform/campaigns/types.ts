export const CAMPAIGN_PLATFORMS = ["google_ads", "meta_ads", "snapchat_ads", "tiktok_ads"] as const
export type CampaignPlatform = (typeof CAMPAIGN_PLATFORMS)[number]

export type CampaignSource = "native" | "imported"
export type CampaignStatus = "active" | "paused" | "archived"

export interface CampaignView {
  id: string
  organizationId: string
  workspaceId: string | null
  source: CampaignSource
  platform: CampaignPlatform | null
  advertisingAccountId: string | null
  externalCampaignId: string | null
  displayName: string
  normalizedName: string
  status: CampaignStatus
  objective: string | null
  budgetCurrency: string | null
  budgetAmount: number | null
  startDate: string | null
  endDate: string | null
  importedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateNativeCampaignInput {
  organizationId: string
  workspaceId: string | null
  displayName: string
  objective?: string | null
  budgetCurrency?: string | null
  budgetAmount?: number | null
  startDate?: string | null
  endDate?: string | null
}

export interface ImportedCampaignInput {
  organizationId: string
  workspaceId: string | null
  platform: CampaignPlatform
  advertisingAccountId: string
  externalCampaignId: string
  displayName: string
  status: CampaignStatus
  objective?: string | null
  budgetCurrency?: string | null
  budgetAmount?: number | null
  startDate?: string | null
  endDate?: string | null
}
