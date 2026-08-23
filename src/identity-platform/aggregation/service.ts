import type { AggregationRepository } from "./repository"
import type { CampaignLinkAttributionDetail, CampaignLinkSummaryRow, RollupResult } from "./types"

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export class AggregationService {
  constructor(private readonly repository: AggregationRepository) {}

  async rollupDaily(organizationId: string, metricDate?: string): Promise<RollupResult> {
    const date = metricDate ?? todayUtc()
    const result = await this.repository.rollupDaily(organizationId, date)
    return { metricDate: date, ...result }
  }

  async getCampaignLinksSummary(
    organizationId: string,
    workspaceId: string | null,
    range: { startDate?: string; endDate?: string } = {}
  ): Promise<CampaignLinkSummaryRow[]> {
    return this.repository.getCampaignLinksSummary(organizationId, workspaceId, {
      startDate: range.startDate ?? null,
      endDate: range.endDate ?? null,
    })
  }

  async getLinkAttributionDetail(
    organizationId: string,
    campaignLinkId: string
  ): Promise<CampaignLinkAttributionDetail> {
    return this.repository.getLinkAttributionDetail(organizationId, campaignLinkId)
  }
}
