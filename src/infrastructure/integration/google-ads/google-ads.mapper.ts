import type {
  CanonicalGoogleAdsAccount,
  CanonicalGoogleAdsAd,
  CanonicalGoogleAdsAdGroup,
  CanonicalGoogleAdsCampaign,
  CanonicalGoogleAdsKeyword,
  CanonicalGoogleAdsPerformanceMetrics,
  GoogleAdsAccountDto,
  GoogleAdsAdDto,
  GoogleAdsAdGroupDto,
  GoogleAdsCampaignDto,
  GoogleAdsKeywordDto,
  GoogleAdsPerformanceMetricDto,
} from "./google-ads.dtos"

export class GoogleAdsMapper {
  static mapAccount(input: GoogleAdsAccountDto): CanonicalGoogleAdsAccount {
    return {
      customerId: input.customer_id,
      managerCustomerId: input.manager_customer_id,
      customerName: input.customer_name,
      managerName: input.manager_name,
      currency: input.currency,
      updatedAt: input.updated_at,
    }
  }

  static mapCampaign(input: GoogleAdsCampaignDto): CanonicalGoogleAdsCampaign {
    return {
      campaignId: input.campaign_id,
      customerId: input.customer_id,
      name: input.name,
      status: input.status,
      channelType: input.channel_type,
      updatedAt: input.updated_at,
    }
  }

  static mapAdGroup(input: GoogleAdsAdGroupDto): CanonicalGoogleAdsAdGroup {
    return {
      adGroupId: input.ad_group_id,
      campaignId: input.campaign_id,
      name: input.name,
      status: input.status,
      updatedAt: input.updated_at,
    }
  }

  static mapAd(input: GoogleAdsAdDto): CanonicalGoogleAdsAd {
    return {
      adId: input.ad_id,
      adGroupId: input.ad_group_id,
      campaignId: input.campaign_id,
      name: input.name,
      status: input.status,
      updatedAt: input.updated_at,
    }
  }

  static mapKeyword(input: GoogleAdsKeywordDto): CanonicalGoogleAdsKeyword {
    return {
      keywordId: input.keyword_id,
      adGroupId: input.ad_group_id,
      campaignId: input.campaign_id,
      text: input.text,
      matchType: input.match_type,
      status: input.status,
      updatedAt: input.updated_at,
    }
  }

  static mapPerformance(
    input: GoogleAdsPerformanceMetricDto
  ): CanonicalGoogleAdsPerformanceMetrics {
    return {
      campaignId: input.campaign_id,
      adGroupId: input.ad_group_id,
      adId: input.ad_id,
      keyword: input.keyword,
      matchType: input.match_type,
      device: input.device,
      network: input.network,
      cost: input.cost,
      clicks: input.clicks,
      impressions: input.impressions,
      ctr: input.ctr,
      cpc: input.cpc,
      cpm: input.cpm,
      conversions: input.conversions,
      conversionValue: input.conversion_value,
      roas: input.roas,
      updatedAt: input.updated_at,
    }
  }
}
