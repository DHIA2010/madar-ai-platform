import type {
  CampaignDetailsViewModel,
  CampaignListQueryDto,
  CampaignListViewModel,
  CreateCampaignRequestDto,
  UpdateCampaignRequestDto,
} from "./contracts"

export type {
  CampaignChannel,
  CampaignDetailsViewModel,
  CampaignListFilters,
  CampaignListQueryDto,
  CampaignListViewModel,
  CampaignStatus,
  CreateCampaignRequestDto,
  UpdateCampaignRequestDto,
} from "./contracts"

export type CampaignListQueryInput = CampaignListQueryDto
export type CampaignListResult = CampaignListViewModel
export type CampaignDetailsResult = CampaignDetailsViewModel
export type CampaignCreatePayload = CreateCampaignRequestDto
export type CampaignUpdatePayload = UpdateCampaignRequestDto
export type CampaignFormValues = CreateCampaignRequestDto
