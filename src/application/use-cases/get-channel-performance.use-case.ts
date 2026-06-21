import type {
  AttributionGateway,
  CampaignPerformanceViewModel,
  ChannelPerformanceViewModel,
} from "../contracts"
import {
  mapCampaignPerformanceReadModelToViewModel,
  mapCampaignPerformanceToReadModel,
  mapChannelPerformanceReadModelToViewModel,
  mapChannelPerformanceToReadModel,
} from "../mappers"
import { GetChannelPerformanceQuery } from "../queries"

export class GetChannelPerformanceUseCase {
  private readonly query: GetChannelPerformanceQuery

  constructor(gateway: AttributionGateway) {
    this.query = new GetChannelPerformanceQuery(gateway)
  }

  async execute(): Promise<ChannelPerformanceViewModel> {
    const performance = await this.query.execute()
    return mapChannelPerformanceReadModelToViewModel(mapChannelPerformanceToReadModel(performance))
  }

  async executeCampaignPerformance(): Promise<CampaignPerformanceViewModel> {
    const performance = await this.query.execute()
    const byCampaign = new Map<
      string,
      {
        campaignId: string
        campaignName: string
        conversions: number
        revenue: number
        spend: number
        roi: number
        roas: number
      }
    >()

    for (const channel of performance) {
      const key = `${channel.channelId}:campaign`
      const current = byCampaign.get(key) ?? {
        campaignId: key,
        campaignName: `${channel.channelName} Campaign`,
        conversions: 0,
        revenue: 0,
        spend: 0,
        roi: 0,
        roas: 0,
      }

      current.conversions += channel.conversions
      current.revenue += channel.revenue
      current.spend += channel.spend
      current.roas = current.spend > 0 ? current.revenue / current.spend : 0
      current.roi = current.spend > 0 ? (current.revenue - current.spend) / current.spend : 0

      byCampaign.set(key, current)
    }

    return mapCampaignPerformanceReadModelToViewModel(
      mapCampaignPerformanceToReadModel([...byCampaign.values()])
    )
  }
}
