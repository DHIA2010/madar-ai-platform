import type {
  CanonicalAd,
  CanonicalAdAccount,
  CanonicalAdSet,
  CanonicalCampaign,
  CanonicalConversionMetrics,
  CanonicalPerformanceMetrics,
  MetaAdsAccountDto,
  MetaAdsAdDto,
  MetaAdsAdSetDto,
  MetaAdsCampaignDto,
  MetaAdsConversionMetricDto,
  MetaAdsPerformanceMetricDto,
} from "./meta-ads.dtos"

export class MetaAdsMapper {
  static mapAccount(input: MetaAdsAccountDto): CanonicalAdAccount {
    return {
      accountId: input.account_id,
      businessId: input.business_id,
      accountName: input.account_name,
      businessName: input.business_name,
      currency: input.currency,
      updatedAt: input.updated_at,
    }
  }

  static mapCampaign(input: MetaAdsCampaignDto): CanonicalCampaign {
    return {
      campaignId: input.campaign_id,
      accountId: input.account_id,
      name: input.name,
      status: input.status,
      objective: input.objective,
      updatedAt: input.updated_at,
    }
  }

  static mapAdSet(input: MetaAdsAdSetDto): CanonicalAdSet {
    return {
      adSetId: input.ad_set_id,
      campaignId: input.campaign_id,
      name: input.name,
      status: input.status,
      updatedAt: input.updated_at,
    }
  }

  static mapAd(input: MetaAdsAdDto): CanonicalAd {
    return {
      adId: input.ad_id,
      adSetId: input.ad_set_id,
      campaignId: input.campaign_id,
      name: input.name,
      status: input.status,
      updatedAt: input.updated_at,
    }
  }

  static mapPerformance(input: MetaAdsPerformanceMetricDto): CanonicalPerformanceMetrics {
    return {
      campaignId: input.campaign_id,
      adSetId: input.ad_set_id,
      adId: input.ad_id,
      spend: input.spend,
      impressions: input.impressions,
      reach: input.reach,
      clicks: input.clicks,
      linkClicks: input.link_clicks,
      ctr: input.ctr,
      cpc: input.cpc,
      cpm: input.cpm,
      frequency: input.frequency,
      source: input.source,
      medium: input.medium,
      placement: input.placement,
      date: input.date,
    }
  }

  static mapConversion(input: MetaAdsConversionMetricDto): CanonicalConversionMetrics {
    return {
      campaignId: input.campaign_id,
      adSetId: input.ad_set_id,
      adId: input.ad_id,
      purchases: input.purchases,
      purchaseValue: input.purchase_value,
      leads: input.leads,
      addToCart: input.add_to_cart,
      initiateCheckout: input.initiate_checkout,
      viewContent: input.view_content,
      source: input.source,
      medium: input.medium,
      placement: input.placement,
      date: input.date,
    }
  }
}
