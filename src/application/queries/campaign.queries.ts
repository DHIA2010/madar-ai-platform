import type {
  CampaignDetailsDto,
  CampaignGateway,
  CampaignListQueryDto,
  CampaignListResponseDto,
} from "../contracts"

export class GetCampaignsQuery {
  constructor(private readonly gateway: CampaignGateway) {}

  execute(input: CampaignListQueryDto): Promise<CampaignListResponseDto> {
    return this.gateway.getCampaigns(input)
  }
}

export class GetCampaignDetailsQuery {
  constructor(private readonly gateway: CampaignGateway) {}

  execute(campaignId: string): Promise<CampaignDetailsDto | null> {
    return this.gateway.getCampaignDetails(campaignId)
  }
}
