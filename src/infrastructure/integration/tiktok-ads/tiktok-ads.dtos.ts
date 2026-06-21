export interface TikTokAdsOAuthTokenResponseDto {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: "Bearer"
}

export interface TikTokAdsAdvertiserAccountDto {
  advertiser_id: string
  advertiser_name: string
  currency: string
  timezone: string
  business_center_id: string
  updated_at: string
}

export interface TikTokAdsBusinessCenterDto {
  business_center_id: string
  business_center_name: string
  country: string
  updated_at: string
}

export interface TikTokAdsCampaignDto {
  campaign_id: string
  advertiser_id: string
  name: string
  status: string
  objective_type: string
  updated_at: string
}

export interface TikTokAdsAdGroupDto {
  ad_group_id: string
  campaign_id: string
  name: string
  status: string
  audience: string
  updated_at: string
}

export interface TikTokAdsCreativeDto {
  creative_id: string
  ad_group_id: string
  ad_id: string
  name: string
  format: string
  updated_at: string
}

export interface TikTokAdsAdDto {
  ad_id: string
  ad_group_id: string
  campaign_id: string
  creative_id: string
  name: string
  status: string
  updated_at: string
}

export interface TikTokAdsPerformanceMetricDto {
  campaign_id: string
  ad_group_id: string
  ad_id: string
  placement: string
  device: string
  audience: string
  source: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  video_views: number
  average_watch_time: number
  updated_at: string
}

export interface TikTokAdsConversionMetricDto {
  campaign_id: string
  ad_group_id: string
  ad_id: string
  placement: string
  device: string
  audience: string
  source: string
  purchases: number
  purchase_value: number
  leads: number
  add_to_cart: number
  initiate_checkout: number
  complete_payment: number
  updated_at: string
}

export interface CanonicalTikTokAdsAdvertiserAccount {
  advertiserId: string
  advertiserName: string
  currency: string
  timezone: string
  businessCenterId: string
  updatedAt: string
}

export interface CanonicalTikTokAdsBusinessCenter {
  businessCenterId: string
  businessCenterName: string
  country: string
  updatedAt: string
}

export interface CanonicalTikTokAdsCampaign {
  campaignId: string
  advertiserId: string
  name: string
  status: string
  objectiveType: string
  updatedAt: string
}

export interface CanonicalTikTokAdsAdGroup {
  adGroupId: string
  campaignId: string
  name: string
  status: string
  audience: string
  updatedAt: string
}

export interface CanonicalTikTokAdsCreative {
  creativeId: string
  adGroupId: string
  adId: string
  name: string
  format: string
  updatedAt: string
}

export interface CanonicalTikTokAdsAd {
  adId: string
  adGroupId: string
  campaignId: string
  creativeId: string
  name: string
  status: string
  updatedAt: string
}

export interface CanonicalTikTokAdsPerformanceMetrics {
  campaignId: string
  adGroupId: string
  adId: string
  placement: string
  device: string
  audience: string
  source: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  videoViews: number
  averageWatchTime: number
  updatedAt: string
}

export interface CanonicalTikTokAdsConversionMetrics {
  campaignId: string
  adGroupId: string
  adId: string
  placement: string
  device: string
  audience: string
  source: string
  purchases: number
  purchaseValue: number
  leads: number
  addToCart: number
  initiateCheckout: number
  completePayment: number
  updatedAt: string
}
