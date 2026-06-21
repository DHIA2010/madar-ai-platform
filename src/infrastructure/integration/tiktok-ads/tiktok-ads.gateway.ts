import type { AccessToken, RefreshToken } from "@/application/contracts/integration.contracts"

import type {
  TikTokAdsAdDto,
  TikTokAdsAdGroupDto,
  TikTokAdsAdvertiserAccountDto,
  TikTokAdsBusinessCenterDto,
  TikTokAdsCampaignDto,
  TikTokAdsConversionMetricDto,
  TikTokAdsCreativeDto,
  TikTokAdsOAuthTokenResponseDto,
  TikTokAdsPerformanceMetricDto,
} from "./tiktok-ads.dtos"

function nowIso() {
  return new Date().toISOString()
}

export class TikTokAdsGateway {
  async exchangeAuthorizationCode(
    connectionId: string,
    authorizationCode?: string
  ): Promise<TikTokAdsOAuthTokenResponseDto> {
    const codeSeed = authorizationCode ?? "default"
    return {
      access_token: `tiktok_ads_access_${connectionId}_${codeSeed}`,
      refresh_token: `tiktok_ads_refresh_${connectionId}_${codeSeed}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async refreshAccessToken(
    connectionId: string,
    refreshToken?: RefreshToken
  ): Promise<TikTokAdsOAuthTokenResponseDto> {
    const tokenSeed = refreshToken?.value ?? "seed"
    return {
      access_token: `tiktok_ads_access_${connectionId}_${Date.now()}_${tokenSeed}`,
      refresh_token: `tiktok_ads_refresh_${connectionId}_${Date.now()}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async validateToken(accessToken?: AccessToken): Promise<boolean> {
    if (!accessToken) {
      return false
    }

    return new Date(accessToken.expiresAt).getTime() > Date.now()
  }

  async fetchAdvertiserAccounts(
    mode: "initial" | "incremental"
  ): Promise<TikTokAdsAdvertiserAccountDto[]> {
    const accounts: TikTokAdsAdvertiserAccountDto[] = [
      {
        advertiser_id: "tt_adv_1",
        advertiser_name: "Madar TikTok Main",
        currency: "SAR",
        timezone: "Asia/Riyadh",
        business_center_id: "tt_bc_1",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      accounts.push({
        advertiser_id: "tt_adv_2",
        advertiser_name: "Madar TikTok KSA",
        currency: "SAR",
        timezone: "Asia/Riyadh",
        business_center_id: "tt_bc_2",
        updated_at: nowIso(),
      })
    }

    return accounts
  }

  async fetchBusinessCenters(
    mode: "initial" | "incremental"
  ): Promise<TikTokAdsBusinessCenterDto[]> {
    const centers: TikTokAdsBusinessCenterDto[] = [
      {
        business_center_id: "tt_bc_1",
        business_center_name: "Madar Group BC",
        country: "SA",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      centers.push({
        business_center_id: "tt_bc_2",
        business_center_name: "Madar Growth BC",
        country: "SA",
        updated_at: nowIso(),
      })
    }

    return centers
  }

  async fetchCampaigns(mode: "initial" | "incremental"): Promise<TikTokAdsCampaignDto[]> {
    const campaigns: TikTokAdsCampaignDto[] = [
      {
        campaign_id: "tt_cmp_1",
        advertiser_id: "tt_adv_1",
        name: "TikTok Prospecting",
        status: "ACTIVE",
        objective_type: "CONVERSIONS",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      campaigns.push({
        campaign_id: "tt_cmp_2",
        advertiser_id: "tt_adv_1",
        name: "TikTok Retargeting",
        status: "PAUSED",
        objective_type: "TRAFFIC",
        updated_at: nowIso(),
      })
    }

    return campaigns
  }

  async fetchAdGroups(mode: "initial" | "incremental"): Promise<TikTokAdsAdGroupDto[]> {
    const adGroups: TikTokAdsAdGroupDto[] = [
      {
        ad_group_id: "tt_ag_1",
        campaign_id: "tt_cmp_1",
        name: "KSA Interest Audience",
        status: "ACTIVE",
        audience: "interest:marketing",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      adGroups.push({
        ad_group_id: "tt_ag_2",
        campaign_id: "tt_cmp_2",
        name: "Site Visitors 30d",
        status: "PAUSED",
        audience: "retargeting:site_visitors_30d",
        updated_at: nowIso(),
      })
    }

    return adGroups
  }

  async fetchAds(mode: "initial" | "incremental"): Promise<TikTokAdsAdDto[]> {
    const ads: TikTokAdsAdDto[] = [
      {
        ad_id: "tt_ad_1",
        ad_group_id: "tt_ag_1",
        campaign_id: "tt_cmp_1",
        creative_id: "tt_cr_1",
        name: "Creator Clip 15s",
        status: "ACTIVE",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      ads.push({
        ad_id: "tt_ad_2",
        ad_group_id: "tt_ag_2",
        campaign_id: "tt_cmp_2",
        creative_id: "tt_cr_2",
        name: "Offer Video 9s",
        status: "PAUSED",
        updated_at: nowIso(),
      })
    }

    return ads
  }

  async fetchCreatives(mode: "initial" | "incremental"): Promise<TikTokAdsCreativeDto[]> {
    const creatives: TikTokAdsCreativeDto[] = [
      {
        creative_id: "tt_cr_1",
        ad_group_id: "tt_ag_1",
        ad_id: "tt_ad_1",
        name: "UGC Creative A",
        format: "VIDEO",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      creatives.push({
        creative_id: "tt_cr_2",
        ad_group_id: "tt_ag_2",
        ad_id: "tt_ad_2",
        name: "Promo Creative B",
        format: "VIDEO",
        updated_at: nowIso(),
      })
    }

    return creatives
  }

  async fetchPerformanceMetrics(
    mode: "initial" | "incremental"
  ): Promise<TikTokAdsPerformanceMetricDto[]> {
    const metrics: TikTokAdsPerformanceMetricDto[] = [
      {
        campaign_id: "tt_cmp_1",
        ad_group_id: "tt_ag_1",
        ad_id: "tt_ad_1",
        placement: "tiktok_feed",
        device: "mobile",
        audience: "interest:marketing",
        source: "tiktok_ads",
        spend: 1300,
        impressions: 51000,
        reach: 35000,
        clicks: 1900,
        ctr: 3.73,
        cpc: 0.68,
        cpm: 25.49,
        video_views: 24000,
        average_watch_time: 6.8,
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      metrics.push({
        campaign_id: "tt_cmp_2",
        ad_group_id: "tt_ag_2",
        ad_id: "tt_ad_2",
        placement: "tiktok_story",
        device: "mobile",
        audience: "retargeting:site_visitors_30d",
        source: "tiktok_ads",
        spend: 700,
        impressions: 26000,
        reach: 18000,
        clicks: 820,
        ctr: 3.15,
        cpc: 0.85,
        cpm: 26.92,
        video_views: 12000,
        average_watch_time: 5.1,
        updated_at: nowIso(),
      })
    }

    return metrics
  }

  async fetchConversionMetrics(
    mode: "initial" | "incremental"
  ): Promise<TikTokAdsConversionMetricDto[]> {
    const metrics: TikTokAdsConversionMetricDto[] = [
      {
        campaign_id: "tt_cmp_1",
        ad_group_id: "tt_ag_1",
        ad_id: "tt_ad_1",
        placement: "tiktok_feed",
        device: "mobile",
        audience: "interest:marketing",
        source: "tiktok_ads",
        purchases: 42,
        purchase_value: 14500,
        leads: 95,
        add_to_cart: 180,
        initiate_checkout: 71,
        complete_payment: 39,
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      metrics.push({
        campaign_id: "tt_cmp_2",
        ad_group_id: "tt_ag_2",
        ad_id: "tt_ad_2",
        placement: "tiktok_story",
        device: "mobile",
        audience: "retargeting:site_visitors_30d",
        source: "tiktok_ads",
        purchases: 19,
        purchase_value: 6100,
        leads: 38,
        add_to_cart: 74,
        initiate_checkout: 27,
        complete_payment: 17,
        updated_at: nowIso(),
      })
    }

    return metrics
  }
}
