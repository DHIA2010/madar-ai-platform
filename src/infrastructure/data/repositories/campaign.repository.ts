import type {
  CampaignDetailsDto,
  CampaignListItemDto,
  CampaignListQueryDto,
  CampaignListResponseDto,
  CampaignRepository,
  CreateCampaignRequestDto,
  UpdateCampaignRequestDto,
} from "@/application/contracts/campaign.contracts"
import { NotFoundError, mapRepositoryError } from "@/infrastructure/data/errors"
import { campaignDetailsMockData, createCampaignFromPayload } from "@/infrastructure/campaigns"

let campaignsDb: CampaignDetailsDto[] = [...campaignDetailsMockData]

function toListItem(campaign: CampaignDetailsDto): CampaignListItemDto {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    channel: campaign.channel,
    budget: campaign.budget,
    spend: campaign.spend,
    revenue: campaign.revenue,
    roas: campaign.roas,
    ctr: campaign.ctr,
    cpc: campaign.cpc,
    conversionRate: campaign.conversionRate,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    owner: campaign.owner,
  }
}

function sortCampaigns(items: CampaignListItemDto[], input: CampaignListQueryDto) {
  const sortBy = input.sortBy ?? "startDate"
  const sortDirection = input.sortDirection ?? "desc"
  const direction = sortDirection === "asc" ? 1 : -1

  return [...items].sort((left, right) => {
    const leftValue = left[sortBy]
    const rightValue = right[sortBy]

    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * direction
    }

    return String(leftValue).localeCompare(String(rightValue), "en") * direction
  })
}

function filterCampaigns(items: CampaignListItemDto[], input: CampaignListQueryDto) {
  return items.filter((item) => {
    if (input.status && item.status !== input.status) {
      return false
    }

    if (input.channel && item.channel !== input.channel) {
      return false
    }

    if (input.search) {
      const haystack = [item.name, item.status, item.channel, item.owner].join(" ").toLowerCase()

      if (!haystack.includes(input.search.toLowerCase())) {
        return false
      }
    }

    return true
  })
}

export class DataCampaignRepository implements CampaignRepository {
  async getCampaigns(input: CampaignListQueryDto): Promise<CampaignListResponseDto> {
    try {
      const filtered = filterCampaigns(campaignsDb.map(toListItem), input)
      const sorted = sortCampaigns(filtered, input)
      const total = sorted.length
      const start = (input.page - 1) * input.pageSize
      const end = start + input.pageSize

      return {
        items: sorted.slice(start, end),
        total,
        page: input.page,
        pageSize: input.pageSize,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getCampaignDetails(campaignId: string): Promise<CampaignDetailsDto | null> {
    try {
      return campaignsDb.find((campaign) => campaign.id === campaignId) ?? null
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async createCampaign(payload: CreateCampaignRequestDto): Promise<CampaignDetailsDto> {
    try {
      const nextId = `cmp_${String(campaignsDb.length + 1).padStart(2, "0")}`
      const nowIso = new Date().toISOString()
      const created = createCampaignFromPayload(nextId, payload, nowIso)
      campaignsDb = [created, ...campaignsDb]
      return created
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async updateCampaign(
    campaignId: string,
    payload: UpdateCampaignRequestDto
  ): Promise<CampaignDetailsDto> {
    try {
      const current = campaignsDb.find((campaign) => campaign.id === campaignId)
      if (!current) {
        throw new NotFoundError({ message: `Campaign ${campaignId} was not found.` })
      }

      const updated: CampaignDetailsDto = {
        ...current,
        ...payload,
      }

      campaignsDb = campaignsDb.map((campaign) => (campaign.id === campaignId ? updated : campaign))

      return updated
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }
}

export function createCampaignRepository(): CampaignRepository {
  return new DataCampaignRepository()
}
