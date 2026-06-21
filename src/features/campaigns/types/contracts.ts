import type {
  CampaignChannel,
  CampaignDetailsViewModel,
  CampaignListQueryDto,
  CampaignListViewModel,
  CampaignStatus,
  CreateCampaignRequestDto,
  UpdateCampaignRequestDto,
} from "@/application"

export type {
  CampaignChannel,
  CampaignDetailsViewModel,
  CampaignListQueryDto,
  CampaignListViewModel,
  CampaignStatus,
  CreateCampaignRequestDto,
  UpdateCampaignRequestDto,
}

export interface CampaignListFilters {
  search: string
  status?: CampaignStatus
  channel?: CampaignChannel
  sortBy?: CampaignListQueryDto["sortBy"]
  sortDirection?: CampaignListQueryDto["sortDirection"]
}
