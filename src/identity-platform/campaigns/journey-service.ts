import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { AttributionRepository } from "../attribution/repository"

import type { CampaignRepository } from "./repository"
import type {
  CampaignPerformancePlatform,
  CampaignPerformanceQuery,
  CampaignsPerformanceAggregationService,
} from "./performance-service"

export interface CampaignJourneyRow {
  // Shared campaigns.id -- null when this ad-platform campaign has never been imported (no
  // "Import" run yet for its platform/account) and so can't be joined to any matched orders.
  campaignId: string | null
  platform: CampaignPerformancePlatform | null
  name: string
  status: string
  currency: string | null
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  orders: number
  revenue: number
  roas: number
  cpa: number
}

const JOURNEY_DEFAULT_WINDOW_DAYS = 30

function resolveJourneyRange(query: CampaignPerformanceQuery): {
  startDateSql: string
  endDateSql: string
} {
  const endDate = query.endDate ? new Date(query.endDate) : new Date()
  const startDate = query.startDate
    ? new Date(query.startDate)
    : new Date(endDate.getTime() - JOURNEY_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const toSql = (d: Date) => d.toISOString().slice(0, 10)
  return { startDateSql: toSql(startDate), endDateSql: toSql(endDate) }
}

// Joins ad-platform spend/impressions/clicks (CampaignsPerformanceAggregationService) with real
// storefront sales (orders matched via OrderAttributionService, read from order_attributions) per
// campaign -- "the journey" from ad spend to an actual sale, computed on the fly from both
// sources, never stored, same convention performance-service.ts already uses.
export class CampaignJourneyService {
  constructor(
    private readonly performanceService: CampaignsPerformanceAggregationService,
    private readonly campaignRepository: CampaignRepository,
    private readonly attributionRepository: AttributionRepository
  ) {}

  async getJourney(
    actor: AuthenticatedActor,
    query: CampaignPerformanceQuery
  ): Promise<CampaignJourneyRow[]> {
    const range = resolveJourneyRange(query)
    const [adRows, imported, salesByCampaignId] = await Promise.all([
      this.performanceService.listAllCampaignRows(actor, query),
      this.campaignRepository.listImported(actor.organizationId),
      this.attributionRepository.aggregateAttributedOrdersByCampaign(actor.organizationId, range),
    ])

    // Bridge: CampaignPerformanceRow.id is "{platform}:{connectionId}:{advertisingAccountId}:
    // {externalCampaignId}" (see performance-service.ts's mapGoogleRow / fetchTikTokCampaignRows
    // etc.). campaigns' own unique key is (platform, advertising_account_id, external_campaign_id)
    // -- connection_id isn't part of it, so it's dropped when building this lookup key.
    const importedByKey = new Map(
      imported
        .filter((c) => c.platform && c.advertisingAccountId && c.externalCampaignId)
        .map((c) => [`${c.platform}:${c.advertisingAccountId}:${c.externalCampaignId}`, c])
    )

    const usedCampaignIds = new Set<string>()
    const rows: CampaignJourneyRow[] = adRows.map((adRow) => {
      const [platformKey, , advertisingAccountId, externalCampaignId] = adRow.id.split(":")
      const matched = importedByKey.get(
        `${platformKey}:${advertisingAccountId}:${externalCampaignId}`
      )
      const sales = matched ? salesByCampaignId.get(matched.id) : undefined
      if (matched) usedCampaignIds.add(matched.id)
      const orders = sales?.orders ?? 0
      const revenue = sales?.revenue ?? 0

      return {
        campaignId: matched?.id ?? null,
        platform: adRow.platform,
        name: adRow.name,
        status: adRow.status,
        currency: adRow.currency,
        spend: adRow.spend,
        impressions: adRow.impressions,
        clicks: adRow.clicks,
        ctr: adRow.ctr,
        cpc: adRow.cpc,
        orders,
        revenue,
        roas: adRow.spend > 0 ? Number((revenue / adRow.spend).toFixed(2)) : 0,
        cpa: orders > 0 ? Number((adRow.spend / orders).toFixed(2)) : 0,
      }
    })

    // A campaign with matched orders but no ad-KPI row in range (e.g. its connector's own sync
    // window doesn't cover these dates) still needs to appear -- the spend side reads zero
    // rather than silently dropping real matched sales from the journey view.
    for (const campaign of imported) {
      if (usedCampaignIds.has(campaign.id)) continue
      const sales = salesByCampaignId.get(campaign.id)
      if (!sales) continue
      rows.push({
        campaignId: campaign.id,
        platform: null,
        name: campaign.displayName,
        status: campaign.status,
        currency: null,
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        orders: sales.orders,
        revenue: sales.revenue,
        roas: 0,
        cpa: 0,
      })
    }

    return rows.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue)
  }
}
