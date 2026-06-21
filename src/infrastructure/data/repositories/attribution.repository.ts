import type {
  AttributionComparison,
  AttributionCredit,
  AttributionModel,
  AttributionRepository,
  AttributionResult,
  CalculateAttributionRequestDto,
  Campaign,
  ChannelPerformance,
  Conversion,
  PreviewAttributionRequestDto,
  RecalculateJourneyRequestDto,
  RoasMetrics,
  RoiMetrics,
  Touchpoint,
} from "@/application/contracts/attribution.contracts"
import { NotFoundError, mapRepositoryError } from "@/infrastructure/data/errors"

const MODEL_ORDER: AttributionModel[] = [
  "first_touch",
  "last_touch",
  "linear",
  "time_decay",
  "position_based",
  "data_driven",
]

const touchpointsDb: readonly Touchpoint[] = Object.freeze([
  {
    touchpointId: "tp_001",
    journeyId: "journey_001",
    occurredAt: "2026-03-01T09:00:00.000Z",
    channel: { id: "channel_meta", name: "Meta" },
    source: { id: "source_facebook", name: "Facebook" },
    medium: { id: "medium_paid_social", name: "Paid Social" },
    campaign: { id: "cmp_spring_launch", name: "Spring Launch" },
    campaignGroup: { id: "cg_seasonal", name: "Seasonal" },
    creative: { id: "crt_video_1", name: "Video Creative 1" },
    ad: { id: "ad_meta_1", name: "Meta Ad 1" },
    referral: { id: "ref_facebook", domain: "facebook.com" },
  },
  {
    touchpointId: "tp_002",
    journeyId: "journey_001",
    occurredAt: "2026-03-02T10:00:00.000Z",
    channel: { id: "channel_search", name: "Search" },
    source: { id: "source_google", name: "Google" },
    medium: { id: "medium_cpc", name: "CPC" },
    campaign: { id: "cmp_brand_search", name: "Brand Search" },
    campaignGroup: { id: "cg_search", name: "Search" },
    keyword: { id: "kw_brand", term: "madar platform" },
  },
  {
    touchpointId: "tp_003",
    journeyId: "journey_001",
    occurredAt: "2026-03-03T11:00:00.000Z",
    channel: { id: "channel_email", name: "Email" },
    source: { id: "source_esp", name: "Klaviyo" },
    medium: { id: "medium_email", name: "Email" },
    campaign: { id: "cmp_email_nurture", name: "Nurture Email" },
    campaignGroup: { id: "cg_retention", name: "Retention" },
    creative: { id: "crt_email_1", name: "Email Hero 1" },
  },
  {
    touchpointId: "tp_004",
    journeyId: "journey_001",
    occurredAt: "2026-03-04T12:00:00.000Z",
    channel: { id: "channel_direct", name: "Direct" },
    source: { id: "source_direct", name: "Direct" },
    medium: { id: "medium_none", name: "None" },
    campaign: { id: "cmp_direct", name: "Direct" },
  },
  {
    touchpointId: "tp_005",
    journeyId: "journey_002",
    occurredAt: "2026-03-06T10:00:00.000Z",
    channel: { id: "channel_search", name: "Search" },
    source: { id: "source_google", name: "Google" },
    medium: { id: "medium_cpc", name: "CPC" },
    campaign: { id: "cmp_nonbrand_search", name: "Non-Brand Search" },
    campaignGroup: { id: "cg_search", name: "Search" },
    keyword: { id: "kw_nonbrand", term: "best ecommerce platform" },
  },
  {
    touchpointId: "tp_006",
    journeyId: "journey_002",
    occurredAt: "2026-03-08T10:00:00.000Z",
    channel: { id: "channel_meta", name: "Meta" },
    source: { id: "source_instagram", name: "Instagram" },
    medium: { id: "medium_paid_social", name: "Paid Social" },
    campaign: { id: "cmp_retargeting", name: "Retargeting" },
    campaignGroup: { id: "cg_retargeting", name: "Retargeting" },
    creative: { id: "crt_carousel_1", name: "Carousel 1" },
  },
])

const conversionsDb: readonly Conversion[] = Object.freeze([
  {
    conversionId: "conv_001",
    journeyId: "journey_001",
    occurredAt: "2026-03-04T12:10:00.000Z",
    revenue: 1000,
    conversions: 1,
    cpa: 120,
    cac: 140,
  },
  {
    conversionId: "conv_002",
    journeyId: "journey_002",
    occurredAt: "2026-03-08T10:15:00.000Z",
    revenue: 600,
    conversions: 1,
    cpa: 95,
    cac: 110,
  },
])

const campaignSpend: Readonly<Record<string, number>> = Object.freeze({
  cmp_spring_launch: 300,
  cmp_brand_search: 180,
  cmp_email_nurture: 60,
  cmp_direct: 0,
  cmp_nonbrand_search: 220,
  cmp_retargeting: 200,
})

function getJourneyTouchpointsSorted(journeyId: string): Touchpoint[] {
  return touchpointsDb
    .filter((touchpoint) => touchpoint.journeyId === journeyId)
    .slice()
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
}

function getConversion(journeyId: string, conversionId: string): Conversion {
  const conversion = conversionsDb.find(
    (entry) => entry.journeyId === journeyId && entry.conversionId === conversionId
  )

  if (!conversion) {
    throw new NotFoundError({
      message: `Conversion ${conversionId} for journey ${journeyId} was not found.`,
    })
  }

  return conversion
}

function normalizeWeights(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) {
    return weights.map(() => 0)
  }
  return weights.map((weight) => weight / total)
}

function computeModelWeights(
  model: AttributionModel,
  touchpoints: Touchpoint[],
  customWeights?: Record<string, number>
): number[] {
  if (touchpoints.length === 0) {
    return []
  }

  if (model === "first_touch") {
    return touchpoints.map((_, index) => (index === 0 ? 1 : 0))
  }

  if (model === "last_touch") {
    return touchpoints.map((_, index) => (index === touchpoints.length - 1 ? 1 : 0))
  }

  if (model === "linear") {
    return touchpoints.map(() => 1 / touchpoints.length)
  }

  if (model === "time_decay") {
    const raw = touchpoints.map((_, index) => Math.pow(0.5, touchpoints.length - index - 1))
    return normalizeWeights(raw)
  }

  if (model === "position_based") {
    if (touchpoints.length === 1) {
      return [1]
    }
    if (touchpoints.length === 2) {
      return [0.5, 0.5]
    }

    const middleCount = touchpoints.length - 2
    const middleCredit = middleCount > 0 ? 0.2 / middleCount : 0

    return touchpoints.map((_, index) => {
      if (index === 0) {
        return 0.4
      }
      if (index === touchpoints.length - 1) {
        return 0.4
      }
      return middleCredit
    })
  }

  if (model === "data_driven") {
    const channelWeights: Record<string, number> = {
      channel_search: 1.3,
      channel_meta: 1.15,
      channel_email: 1.05,
      channel_direct: 0.7,
    }
    const raw = touchpoints.map((touchpoint) => channelWeights[touchpoint.channel.id] ?? 1)
    return normalizeWeights(raw)
  }

  if (model === "custom") {
    const raw = touchpoints.map((touchpoint) => {
      const byTouchpoint = customWeights?.[touchpoint.touchpointId]
      if (byTouchpoint !== undefined) {
        return byTouchpoint
      }
      const byCampaign = customWeights?.[touchpoint.campaign.id]
      if (byCampaign !== undefined) {
        return byCampaign
      }
      const byChannel = customWeights?.[touchpoint.channel.id]
      if (byChannel !== undefined) {
        return byChannel
      }
      return 1
    })
    return normalizeWeights(raw)
  }

  return touchpoints.map(() => 1 / touchpoints.length)
}

function applyCredits(
  touchpoints: Touchpoint[],
  conversion: Conversion,
  model: AttributionModel,
  customWeights?: Record<string, number>
): AttributionResult {
  const weights = computeModelWeights(model, touchpoints, customWeights)

  const credits: AttributionCredit[] = touchpoints.map((touchpoint, index) => {
    const credit = weights[index] ?? 0
    return {
      touchpointId: touchpoint.touchpointId,
      channelId: touchpoint.channel.id,
      campaignId: touchpoint.campaign.id,
      creativeId: touchpoint.creative?.id,
      credit,
      attributedRevenue: conversion.revenue * credit,
      attributedConversions: conversion.conversions * credit,
    }
  })

  return {
    journeyId: conversion.journeyId,
    conversionId: conversion.conversionId,
    model,
    totalRevenue: conversion.revenue,
    totalConversions: conversion.conversions,
    credits,
  }
}

function aggregateByCampaign(
  results: AttributionResult[]
): Map<string, { revenue: number; conversions: number }> {
  const grouped = new Map<string, { revenue: number; conversions: number }>()

  for (const result of results) {
    for (const credit of result.credits) {
      const current = grouped.get(credit.campaignId) ?? { revenue: 0, conversions: 0 }
      current.revenue += credit.attributedRevenue
      current.conversions += credit.attributedConversions
      grouped.set(credit.campaignId, current)
    }
  }

  return grouped
}

export class DataAttributionRepository implements AttributionRepository {
  async calculateAttribution(input: CalculateAttributionRequestDto): Promise<AttributionResult> {
    try {
      const touchpoints = getJourneyTouchpointsSorted(input.journeyId)
      if (touchpoints.length === 0) {
        throw new NotFoundError({ message: `Journey ${input.journeyId} has no touchpoints.` })
      }

      const conversion = getConversion(input.journeyId, input.conversionId)
      return applyCredits(touchpoints, conversion, input.model, input.customWeights)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async recalculateJourney(input: RecalculateJourneyRequestDto): Promise<AttributionComparison> {
    try {
      const models = input.models.length > 0 ? input.models : MODEL_ORDER

      const modelResults = await Promise.all(
        models.map((model) =>
          this.calculateAttribution({
            journeyId: input.journeyId,
            conversionId: input.conversionId,
            model,
            customWeights: input.customWeights,
          })
        )
      )

      return {
        journeyId: input.journeyId,
        conversionId: input.conversionId,
        models: modelResults.map((result) => {
          const sorted = result.credits.slice().sort((a, b) => b.credit - a.credit)
          return {
            model: result.model,
            credits: result.credits,
            topChannelId: sorted[0]?.channelId,
            topCampaignId: sorted[0]?.campaignId,
          }
        }),
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getJourneyTouchpoints(journeyId: string): Promise<Touchpoint[]> {
    try {
      return getJourneyTouchpointsSorted(journeyId)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getConversionAttribution(
    journeyId: string,
    conversionId: string
  ): Promise<AttributionResult[]> {
    try {
      return Promise.all(
        MODEL_ORDER.map((model) =>
          this.calculateAttribution({
            journeyId,
            conversionId,
            model,
          })
        )
      )
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getCampaignROI(campaignId: string): Promise<RoiMetrics | null> {
    try {
      const results = await Promise.all(
        conversionsDb.map((conversion) =>
          this.calculateAttribution({
            journeyId: conversion.journeyId,
            conversionId: conversion.conversionId,
            model: "last_touch",
          })
        )
      )

      const aggregated = aggregateByCampaign(results).get(campaignId)
      if (!aggregated) {
        return null
      }

      const spend = campaignSpend[campaignId] ?? 0
      return {
        campaignId,
        revenue: aggregated.revenue,
        spend,
        roi: spend > 0 ? (aggregated.revenue - spend) / spend : 0,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getCampaignROAS(campaignId: string): Promise<RoasMetrics | null> {
    try {
      const roi = await this.getCampaignROI(campaignId)
      if (!roi) {
        return null
      }

      return {
        campaignId,
        revenue: roi.revenue,
        spend: roi.spend,
        roas: roi.spend > 0 ? roi.revenue / roi.spend : 0,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getChannelPerformance(): Promise<ChannelPerformance[]> {
    try {
      const results = await Promise.all(
        conversionsDb.map((conversion) =>
          this.calculateAttribution({
            journeyId: conversion.journeyId,
            conversionId: conversion.conversionId,
            model: "linear",
          })
        )
      )

      const grouped = new Map<
        string,
        {
          channelId: string
          channelName: string
          conversions: number
          revenue: number
          spend: number
        }
      >()

      for (const result of results) {
        const touchpointMap = new Map(
          getJourneyTouchpointsSorted(result.journeyId).map((touchpoint) => [
            touchpoint.touchpointId,
            touchpoint,
          ])
        )

        for (const credit of result.credits) {
          const touchpoint = touchpointMap.get(credit.touchpointId)
          if (!touchpoint) {
            continue
          }

          const current = grouped.get(credit.channelId) ?? {
            channelId: credit.channelId,
            channelName: touchpoint.channel.name,
            conversions: 0,
            revenue: 0,
            spend: 0,
          }

          current.conversions += credit.attributedConversions
          current.revenue += credit.attributedRevenue
          current.spend += (campaignSpend[credit.campaignId] ?? 0) * credit.credit

          grouped.set(credit.channelId, current)
        }
      }

      return [...grouped.values()].map((item) => ({
        channelId: item.channelId,
        channelName: item.channelName,
        conversions: item.conversions,
        revenue: item.revenue,
        spend: item.spend,
        roi: item.spend > 0 ? (item.revenue - item.spend) / item.spend : 0,
        roas: item.spend > 0 ? item.revenue / item.spend : 0,
        conversionRate: conversionsDb.length > 0 ? item.conversions / conversionsDb.length : 0,
      }))
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async compareAttributionModels(
    input: RecalculateJourneyRequestDto
  ): Promise<AttributionComparison> {
    try {
      return this.recalculateJourney(input)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async previewAttribution(input: PreviewAttributionRequestDto): Promise<AttributionResult> {
    try {
      const touchpoints = getJourneyTouchpointsSorted(input.journeyId)
      if (touchpoints.length === 0) {
        throw new NotFoundError({ message: `Journey ${input.journeyId} has no touchpoints.` })
      }

      const previewConversion: Conversion = {
        conversionId: "preview_conversion",
        journeyId: input.journeyId,
        occurredAt: new Date().toISOString(),
        revenue: input.conversionRevenue,
        conversions: 1,
        cpa: 0,
        cac: 0,
      }

      return applyCredits(touchpoints, previewConversion, input.model, input.customWeights)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }
}

export function createAttributionRepository(): AttributionRepository {
  return new DataAttributionRepository()
}
