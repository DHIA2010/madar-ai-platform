export interface GoogleAdsOAuthTokenResponseDto {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: "Bearer"
}

export interface GoogleAdsAccountDto {
  customer_id: string
  manager_customer_id: string
  customer_name: string
  manager_name: string
  currency: string
  updated_at: string
}

export interface GoogleAdsCampaignDto {
  campaign_id: string
  customer_id: string
  name: string
  status: string
  channel_type: string
  updated_at: string
}

export interface GoogleAdsAdGroupDto {
  ad_group_id: string
  campaign_id: string
  name: string
  status: string
  updated_at: string
}

export interface GoogleAdsAdDto {
  ad_id: string
  ad_group_id: string
  campaign_id: string
  name: string
  status: string
  updated_at: string
}

export interface GoogleAdsKeywordDto {
  keyword_id: string
  ad_group_id: string
  campaign_id: string
  text: string
  match_type: string
  status: string
  updated_at: string
}

export interface GoogleAdsPerformanceMetricDto {
  campaign_id: string
  ad_group_id: string
  ad_id: string
  keyword: string
  match_type: string
  device: string
  network: string
  cost: number
  clicks: number
  impressions: number
  ctr: number
  cpc: number
  cpm: number
  conversions: number
  conversion_value: number
  roas: number
  updated_at: string
}

export interface CanonicalGoogleAdsAccount {
  customerId: string
  managerCustomerId: string
  customerName: string
  managerName: string
  currency: string
  updatedAt: string
}

export interface CanonicalGoogleAdsCampaign {
  campaignId: string
  customerId: string
  name: string
  status: string
  channelType: string
  updatedAt: string
}

export interface CanonicalGoogleAdsAdGroup {
  adGroupId: string
  campaignId: string
  name: string
  status: string
  updatedAt: string
}

export interface CanonicalGoogleAdsAd {
  adId: string
  adGroupId: string
  campaignId: string
  name: string
  status: string
  updatedAt: string
}

export interface CanonicalGoogleAdsKeyword {
  keywordId: string
  adGroupId: string
  campaignId: string
  text: string
  matchType: string
  status: string
  updatedAt: string
}

export interface CanonicalGoogleAdsPerformanceMetrics {
  campaignId: string
  adGroupId: string
  adId: string
  keyword: string
  matchType: string
  device: string
  network: string
  cost: number
  clicks: number
  impressions: number
  ctr: number
  cpc: number
  cpm: number
  conversions: number
  conversionValue: number
  roas: number
  updatedAt: string
}
