import type {
  CanonicalTikTokAdsAd,
  CanonicalTikTokAdsAdGroup,
  CanonicalTikTokAdsAdvertiserAccount,
  CanonicalTikTokAdsBusinessCenter,
  CanonicalTikTokAdsCampaign,
  CanonicalTikTokAdsConversionMetrics,
  CanonicalTikTokAdsCreative,
  CanonicalTikTokAdsPerformanceMetrics,
  TikTokAdsAdDto,
  TikTokAdsAdGroupDto,
  TikTokAdsAdvertiserAccountDto,
  TikTokAdsBusinessCenterDto,
  TikTokAdsCampaignDto,
  TikTokAdsConversionMetricDto,
  TikTokAdsCreativeDto,
  TikTokAdsPerformanceMetricDto,
} from "./tiktok-ads.dtos"

export class TikTokAdsMapper {
  static mapAdvertiserAccount(
    input: TikTokAdsAdvertiserAccountDto
  ): CanonicalTikTokAdsAdvertiserAccount {
    return {
      advertiserId: input.advertiser_id,
      advertiserName: input.advertiser_name,
      currency: input.currency,
      timezone: input.timezone,
      businessCenterId: input.business_center_id,
      updatedAt: input.updated_at,
    }
  }

  static mapBusinessCenter(input: TikTokAdsBusinessCenterDto): CanonicalTikTokAdsBusinessCenter {
    return {
      businessCenterId: input.business_center_id,
      businessCenterName: input.business_center_name,
      country: input.country,
      updatedAt: input.updated_at,
    }
  }

  static mapCampaign(input: TikTokAdsCampaignDto): CanonicalTikTokAdsCampaign {
    return {
      campaignId: input.campaign_id,
      advertiserId: input.advertiser_id,
      name: input.name,
      status: input.status,
      objectiveType: input.objective_type,
      updatedAt: input.updated_at,
    }
  }

  static mapAdGroup(input: TikTokAdsAdGroupDto): CanonicalTikTokAdsAdGroup {
    return {
      adGroupId: input.ad_group_id,
      campaignId: input.campaign_id,
      name: input.name,
      status: input.status,
      audience: input.audience,
      updatedAt: input.updated_at,
    }
  }

  static mapAd(input: TikTokAdsAdDto): CanonicalTikTokAdsAd {
    return {
      adId: input.ad_id,
      adGroupId: input.ad_group_id,
      campaignId: input.campaign_id,
      creativeId: input.creative_id,
      name: input.name,
      status: input.status,
      updatedAt: input.updated_at,
    }
  }

  static mapCreative(input: TikTokAdsCreativeDto): CanonicalTikTokAdsCreative {
    return {
      creativeId: input.creative_id,
      adGroupId: input.ad_group_id,
      adId: input.ad_id,
      name: input.name,
      format: input.format,
      updatedAt: input.updated_at,
    }
  }

  static mapPerformance(
    input: TikTokAdsPerformanceMetricDto
  ): CanonicalTikTokAdsPerformanceMetrics {
    return {
      campaignId: input.campaign_id,
      adGroupId: input.ad_group_id,
      adId: input.ad_id,
      placement: input.placement,
      device: input.device,
      audience: input.audience,
      source: input.source,
      spend: input.spend,
      impressions: input.impressions,
      reach: input.reach,
      clicks: input.clicks,
      ctr: input.ctr,
      cpc: input.cpc,
      cpm: input.cpm,
      videoViews: input.video_views,
      averageWatchTime: input.average_watch_time,
      updatedAt: input.updated_at,
    }
  }

  static mapConversion(input: TikTokAdsConversionMetricDto): CanonicalTikTokAdsConversionMetrics {
    return {
      campaignId: input.campaign_id,
      adGroupId: input.ad_group_id,
      adId: input.ad_id,
      placement: input.placement,
      device: input.device,
      audience: input.audience,
      source: input.source,
      purchases: input.purchases,
      purchaseValue: input.purchase_value,
      leads: input.leads,
      addToCart: input.add_to_cart,
      initiateCheckout: input.initiate_checkout,
      completePayment: input.complete_payment,
      updatedAt: input.updated_at,
    }
  }
}
