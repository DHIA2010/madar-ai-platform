import type {
  CanonicalSnapchatAdsAd,
  CanonicalSnapchatAdsAdAccount,
  CanonicalSnapchatAdsAdSquad,
  CanonicalSnapchatAdsCampaign,
  CanonicalSnapchatAdsConversionMetrics,
  CanonicalSnapchatAdsCreative,
  CanonicalSnapchatAdsOrganization,
  CanonicalSnapchatAdsPerformanceMetrics,
  SnapchatAdsAdAccountDto,
  SnapchatAdsAdDto,
  SnapchatAdsAdSquadDto,
  SnapchatAdsCampaignDto,
  SnapchatAdsConversionMetricDto,
  SnapchatAdsCreativeDto,
  SnapchatAdsOrganizationDto,
  SnapchatAdsPerformanceMetricDto,
} from "./snapchat-ads.dtos"

export class SnapchatAdsMapper {
  static mapAdAccount(input: SnapchatAdsAdAccountDto): CanonicalSnapchatAdsAdAccount {
    return {
      adAccountId: input.ad_account_id,
      adAccountName: input.ad_account_name,
      organizationId: input.organization_id,
      currency: input.currency,
      timezone: input.timezone,
      updatedAt: input.updated_at,
    }
  }

  static mapOrganization(input: SnapchatAdsOrganizationDto): CanonicalSnapchatAdsOrganization {
    return {
      organizationId: input.organization_id,
      organizationName: input.organization_name,
      country: input.country,
      updatedAt: input.updated_at,
    }
  }

  static mapCampaign(input: SnapchatAdsCampaignDto): CanonicalSnapchatAdsCampaign {
    return {
      campaignId: input.campaign_id,
      adAccountId: input.ad_account_id,
      name: input.name,
      status: input.status,
      objective: input.objective,
      updatedAt: input.updated_at,
    }
  }

  static mapAdSquad(input: SnapchatAdsAdSquadDto): CanonicalSnapchatAdsAdSquad {
    return {
      adSquadId: input.ad_squad_id,
      campaignId: input.campaign_id,
      name: input.name,
      status: input.status,
      audience: input.audience,
      updatedAt: input.updated_at,
    }
  }

  static mapAd(input: SnapchatAdsAdDto): CanonicalSnapchatAdsAd {
    return {
      adId: input.ad_id,
      adSquadId: input.ad_squad_id,
      campaignId: input.campaign_id,
      creativeId: input.creative_id,
      name: input.name,
      status: input.status,
      updatedAt: input.updated_at,
    }
  }

  static mapCreative(input: SnapchatAdsCreativeDto): CanonicalSnapchatAdsCreative {
    return {
      creativeId: input.creative_id,
      adSquadId: input.ad_squad_id,
      adId: input.ad_id,
      name: input.name,
      format: input.format,
      updatedAt: input.updated_at,
    }
  }

  static mapPerformance(
    input: SnapchatAdsPerformanceMetricDto
  ): CanonicalSnapchatAdsPerformanceMetrics {
    return {
      campaignId: input.campaign_id,
      adSquadId: input.ad_squad_id,
      adId: input.ad_id,
      placement: input.placement,
      device: input.device,
      audience: input.audience,
      source: input.source,
      spend: input.spend,
      impressions: input.impressions,
      reach: input.reach,
      swipeUps: input.swipe_ups,
      clicks: input.clicks,
      ctr: input.ctr,
      cpc: input.cpc,
      cpm: input.cpm,
      videoViews: input.video_views,
      updatedAt: input.updated_at,
    }
  }

  static mapConversion(
    input: SnapchatAdsConversionMetricDto
  ): CanonicalSnapchatAdsConversionMetrics {
    return {
      campaignId: input.campaign_id,
      adSquadId: input.ad_squad_id,
      adId: input.ad_id,
      placement: input.placement,
      device: input.device,
      audience: input.audience,
      source: input.source,
      purchases: input.purchases,
      purchaseValue: input.purchase_value,
      leads: input.leads,
      addToCart: input.add_to_cart,
      startCheckout: input.start_checkout,
      updatedAt: input.updated_at,
    }
  }
}
