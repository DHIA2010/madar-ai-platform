export interface MetaAdsOAuthTokenResponseDto {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: "Bearer"
}

export interface MetaAdsAccountDto {
  account_id: string
  business_id: string
  account_name: string
  business_name: string
  currency: string
  updated_at: string
}

export interface MetaAdsCampaignDto {
  campaign_id: string
  account_id: string
  name: string
  status: string
  objective: string
  updated_at: string
}

export interface MetaAdsAdSetDto {
  ad_set_id: string
  campaign_id: string
  name: string
  status: string
  updated_at: string
}

export interface MetaAdsAdDto {
  ad_id: string
  ad_set_id: string
  campaign_id: string
  name: string
  status: string
  updated_at: string
}

export interface MetaAdsPerformanceMetricDto {
  campaign_id: string
  ad_set_id: string
  ad_id: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  link_clicks: number
  ctr: number
  cpc: number
  cpm: number
  frequency: number
  source: string
  medium: string
  placement: string
  date: string
}

export interface MetaAdsConversionMetricDto {
  campaign_id: string
  ad_set_id: string
  ad_id: string
  purchases: number
  purchase_value: number
  leads: number
  add_to_cart: number
  initiate_checkout: number
  view_content: number
  source: string
  medium: string
  placement: string
  date: string
}

export interface CanonicalAdAccount {
  accountId: string
  businessId: string
  accountName: string
  businessName: string
  currency: string
  updatedAt: string
}

export interface CanonicalCampaign {
  campaignId: string
  accountId: string
  name: string
  status: string
  objective: string
  updatedAt: string
}

export interface CanonicalAdSet {
  adSetId: string
  campaignId: string
  name: string
  status: string
  updatedAt: string
}

export interface CanonicalAd {
  adId: string
  adSetId: string
  campaignId: string
  name: string
  status: string
  updatedAt: string
}

export interface CanonicalPerformanceMetrics {
  campaignId: string
  adSetId: string
  adId: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  linkClicks: number
  ctr: number
  cpc: number
  cpm: number
  frequency: number
  source: string
  medium: string
  placement: string
  date: string
}

export interface CanonicalConversionMetrics {
  campaignId: string
  adSetId: string
  adId: string
  purchases: number
  purchaseValue: number
  leads: number
  addToCart: number
  initiateCheckout: number
  viewContent: number
  source: string
  medium: string
  placement: string
  date: string
}
