export type CampaignStatus = "draft" | "active" | "paused" | "completed"

export interface Campaign {
  id: string
  name: string
  status: CampaignStatus
}
