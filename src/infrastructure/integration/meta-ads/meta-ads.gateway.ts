import type { AccessToken, RefreshToken } from "@/application/contracts/integration.contracts"

import type {
  MetaAdsAccountDto,
  MetaAdsAdDto,
  MetaAdsAdSetDto,
  MetaAdsCampaignDto,
  MetaAdsConversionMetricDto,
  MetaAdsOAuthTokenResponseDto,
  MetaAdsPerformanceMetricDto,
} from "./meta-ads.dtos"

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function nowIso() {
  return new Date().toISOString()
}

export class MetaAdsGateway {
  async exchangeAuthorizationCode(
    connectionId: string,
    authorizationCode?: string
  ): Promise<MetaAdsOAuthTokenResponseDto> {
    const codeSeed = authorizationCode ?? "default"
    return {
      access_token: `meta_access_${connectionId}_${codeSeed}`,
      refresh_token: `meta_refresh_${connectionId}_${codeSeed}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async refreshAccessToken(
    connectionId: string,
    refreshToken?: RefreshToken
  ): Promise<MetaAdsOAuthTokenResponseDto> {
    const tokenSeed = refreshToken?.value ?? "seed"
    return {
      access_token: `meta_access_${connectionId}_${Date.now()}_${tokenSeed}`,
      refresh_token: `meta_refresh_${connectionId}_${Date.now()}`,
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

  async fetchAccounts(mode: "initial" | "incremental"): Promise<MetaAdsAccountDto[]> {
    const accounts: MetaAdsAccountDto[] = [
      {
        account_id: "act_1",
        business_id: "biz_1",
        account_name: "Madar Main Account",
        business_name: "Madar Commerce",
        currency: "SAR",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      accounts.push({
        account_id: "act_2",
        business_id: "biz_1",
        account_name: "Madar Retargeting Account",
        business_name: "Madar Commerce",
        currency: "SAR",
        updated_at: nowIso(),
      })
    }

    return accounts
  }

  async fetchCampaigns(mode: "initial" | "incremental"): Promise<MetaAdsCampaignDto[]> {
    const campaigns: MetaAdsCampaignDto[] = [
      {
        campaign_id: "cmp_1",
        account_id: "act_1",
        name: "Summer Collection",
        status: "ACTIVE",
        objective: "CONVERSIONS",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      campaigns.push({
        campaign_id: "cmp_2",
        account_id: "act_1",
        name: "Brand Awareness KSA",
        status: "PAUSED",
        objective: "AWARENESS",
        updated_at: nowIso(),
      })
    }

    return campaigns
  }

  async fetchAdSets(mode: "initial" | "incremental"): Promise<MetaAdsAdSetDto[]> {
    const adSets: MetaAdsAdSetDto[] = [
      {
        ad_set_id: "adset_1",
        campaign_id: "cmp_1",
        name: "High Intent Audience",
        status: "ACTIVE",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      adSets.push({
        ad_set_id: "adset_2",
        campaign_id: "cmp_2",
        name: "Broad Audience",
        status: "PAUSED",
        updated_at: nowIso(),
      })
    }

    return adSets
  }

  async fetchAds(mode: "initial" | "incremental"): Promise<MetaAdsAdDto[]> {
    const ads: MetaAdsAdDto[] = [
      {
        ad_id: "ad_1",
        ad_set_id: "adset_1",
        campaign_id: "cmp_1",
        name: "Carousel Creative 1",
        status: "ACTIVE",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      ads.push({
        ad_id: "ad_2",
        ad_set_id: "adset_2",
        campaign_id: "cmp_2",
        name: "Video Creative 1",
        status: "PAUSED",
        updated_at: nowIso(),
      })
    }

    return ads
  }

  async fetchPerformanceMetrics(
    mode: "initial" | "incremental"
  ): Promise<MetaAdsPerformanceMetricDto[]> {
    const metrics: MetaAdsPerformanceMetricDto[] = [
      {
        campaign_id: "cmp_1",
        ad_set_id: "adset_1",
        ad_id: "ad_1",
        spend: 2300,
        impressions: 120000,
        reach: 84000,
        clicks: 5200,
        link_clicks: 3300,
        ctr: 4.33,
        cpc: 0.44,
        cpm: 19.16,
        frequency: 1.43,
        source: "meta",
        medium: "paid_social",
        placement: "instagram_feed",
        date: todayIsoDate(),
      },
    ]

    if (mode === "initial") {
      metrics.push({
        campaign_id: "cmp_2",
        ad_set_id: "adset_2",
        ad_id: "ad_2",
        spend: 1200,
        impressions: 91000,
        reach: 70000,
        clicks: 2100,
        link_clicks: 1450,
        ctr: 2.31,
        cpc: 0.57,
        cpm: 13.18,
        frequency: 1.3,
        source: "meta",
        medium: "paid_social",
        placement: "facebook_feed",
        date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
      })
    }

    return metrics
  }

  async fetchConversionMetrics(
    mode: "initial" | "incremental"
  ): Promise<MetaAdsConversionMetricDto[]> {
    const metrics: MetaAdsConversionMetricDto[] = [
      {
        campaign_id: "cmp_1",
        ad_set_id: "adset_1",
        ad_id: "ad_1",
        purchases: 54,
        purchase_value: 16200,
        leads: 120,
        add_to_cart: 310,
        initiate_checkout: 140,
        view_content: 2400,
        source: "meta",
        medium: "paid_social",
        placement: "instagram_feed",
        date: todayIsoDate(),
      },
    ]

    if (mode === "initial") {
      metrics.push({
        campaign_id: "cmp_2",
        ad_set_id: "adset_2",
        ad_id: "ad_2",
        purchases: 20,
        purchase_value: 6100,
        leads: 65,
        add_to_cart: 170,
        initiate_checkout: 84,
        view_content: 1800,
        source: "meta",
        medium: "paid_social",
        placement: "facebook_feed",
        date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
      })
    }

    return metrics
  }
}
