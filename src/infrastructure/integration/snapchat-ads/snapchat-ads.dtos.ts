export interface SnapchatAdsOAuthTokenResponseDto {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: "Bearer"
}

export interface SnapchatAdsAdAccountDto {
  ad_account_id: string
  ad_account_name: string
  organization_id: string
  currency: string
  timezone: string
  updated_at: string
}

export interface SnapchatAdsOrganizationDto {
  organization_id: string
  organization_name: string
  country: string
  updated_at: string
}

export interface SnapchatAdsCampaignDto {
  campaign_id: string
  ad_account_id: string
  name: string
  status: string
  objective: string
  updated_at: string
}

export interface SnapchatAdsAdSquadDto {
  ad_squad_id: string
  campaign_id: string
  name: string
  status: string
  audience: string
  updated_at: string
}

export interface SnapchatAdsCreativeDto {
  creative_id: string
  ad_squad_id: string
  ad_id: string
  name: string
  format: string
  updated_at: string
}

export interface SnapchatAdsAdDto {
  ad_id: string
  ad_squad_id: string
  campaign_id: string
  creative_id: string
  name: string
  status: string
  updated_at: string
}

export interface SnapchatAdsPerformanceMetricDto {
  campaign_id: string
  ad_squad_id: string
  ad_id: string
  placement: string
  device: string
  audience: string
  source: string
  spend: number
  impressions: number
  reach: number
  swipe_ups: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  video_views: number
  updated_at: string
}

export interface SnapchatAdsConversionMetricDto {
  campaign_id: string
  ad_squad_id: string
  ad_id: string
  placement: string
  device: string
  audience: string
  source: string
  purchases: number
  purchase_value: number
  leads: number
  add_to_cart: number
  start_checkout: number
  updated_at: string
}

export interface CanonicalSnapchatAdsAdAccount {
  adAccountId: string
  adAccountName: string
  organizationId: string
  currency: string
  timezone: string
  updatedAt: string
}

export interface CanonicalSnapchatAdsOrganization {
  organizationId: string
  organizationName: string
  country: string
  updatedAt: string
}

export interface CanonicalSnapchatAdsCampaign {
  campaignId: string
  adAccountId: string
  name: string
  status: string
  objective: string
  updatedAt: string
}

export interface CanonicalSnapchatAdsAdSquad {
  adSquadId: string
  campaignId: string
  name: string
  status: string
  audience: string
  updatedAt: string
}

export interface CanonicalSnapchatAdsCreative {
  creativeId: string
  adSquadId: string
  adId: string
  name: string
  format: string
  updatedAt: string
}

export interface CanonicalSnapchatAdsAd {
  adId: string
  adSquadId: string
  campaignId: string
  creativeId: string
  name: string
  status: string
  updatedAt: string
}

export interface CanonicalSnapchatAdsPerformanceMetrics {
  campaignId: string
  adSquadId: string
  adId: string
  placement: string
  device: string
  audience: string
  source: string
  spend: number
  impressions: number
  reach: number
  swipeUps: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  videoViews: number
  updatedAt: string
}

export interface CanonicalSnapchatAdsConversionMetrics {
  campaignId: string
  adSquadId: string
  adId: string
  placement: string
  device: string
  audience: string
  source: string
  purchases: number
  purchaseValue: number
  leads: number
  addToCart: number
  startCheckout: number
  updatedAt: string
}
