import type { ReadModel, ReadModelViewModel } from "./read-model.contracts"

export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived"

export type CampaignChannel = "meta" | "google" | "tiktok" | "snapchat" | "linkedin" | "email"

export interface CampaignListQueryDto {
  page: number
  pageSize: number
  search?: string
  status?: CampaignStatus
  channel?: CampaignChannel
  sortBy?:
    | "name"
    | "status"
    | "channel"
    | "budget"
    | "spend"
    | "revenue"
    | "roas"
    | "ctr"
    | "cpc"
    | "conversionRate"
    | "startDate"
    | "endDate"
    | "owner"
  sortDirection?: "asc" | "desc"
}

export interface CampaignListItemDto {
  id: string
  name: string
  status: CampaignStatus
  channel: CampaignChannel
  budget: number
  spend: number
  revenue: number
  roas: number
  ctr: number
  cpc: number
  conversionRate: number
  startDate: string
  endDate: string
  owner: string
}

export interface CampaignListResponseDto {
  items: CampaignListItemDto[]
  total: number
  page: number
  pageSize: number
}

export interface CampaignKpiDto {
  totalRevenue: number
  marketingSpend: number
  roas: number
  cac: number
  conversionRate: number
  websiteVisitors: number
  sessions: number
  bounceRate: number
  activeCampaigns: number
}

export interface CampaignTimelineEntryDto {
  date: string
  title: string
  description: string
}

export interface CampaignActivityEntryDto {
  id: string
  occurredAt: string
  actor: string
  action: string
  details: string
}

export interface CampaignDetailsDto {
  id: string
  name: string
  status: CampaignStatus
  objective: string
  channel: CampaignChannel
  owner: string
  budget: number
  spend: number
  revenue: number
  roas: number
  ctr: number
  cpc: number
  conversionRate: number
  startDate: string
  endDate: string
  audience: string
  country: string
  language: string
  overview: string
  kpis: CampaignKpiDto
  performance: Array<{ month: string; spend: number; revenue: number; leads: number }>
  budgetSummary: Array<{ label: string; value: number }>
  audienceSummary: Array<{ segment: string; percentage: number }>
  channelsSummary: Array<{ channel: CampaignChannel; contribution: number }>
  timeline: CampaignTimelineEntryDto[]
  activity: CampaignActivityEntryDto[]
  aiRecommendations: string[]
}

export interface CreateCampaignRequestDto {
  name: string
  objective: string
  channel: CampaignChannel
  budget: number
  startDate: string
  endDate: string
  audience: string
  country: string
  language: string
  status: CampaignStatus
  owner: string
}

export type UpdateCampaignRequestDto = CreateCampaignRequestDto

export interface CampaignRepository {
  getCampaigns(input: CampaignListQueryDto): Promise<CampaignListResponseDto>
  getCampaignDetails(campaignId: string): Promise<CampaignDetailsDto | null>
  createCampaign(payload: CreateCampaignRequestDto): Promise<CampaignDetailsDto>
  updateCampaign(campaignId: string, payload: UpdateCampaignRequestDto): Promise<CampaignDetailsDto>
}

export type CampaignGateway = CampaignRepository

export type CampaignListReadModel = ReadModel<CampaignListResponseDto>
export type CampaignListViewModel = ReadModelViewModel<CampaignListResponseDto>

export type CampaignDetailsReadModel = ReadModel<CampaignDetailsDto>
export type CampaignDetailsViewModel = ReadModelViewModel<CampaignDetailsDto>
