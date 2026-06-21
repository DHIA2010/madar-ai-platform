import type { AccessToken, RefreshToken } from "@/application/contracts/integration.contracts"

import type {
  GoogleAdsAccountDto,
  GoogleAdsAdDto,
  GoogleAdsAdGroupDto,
  GoogleAdsCampaignDto,
  GoogleAdsKeywordDto,
  GoogleAdsOAuthTokenResponseDto,
  GoogleAdsPerformanceMetricDto,
} from "./google-ads.dtos"

function nowIso() {
  return new Date().toISOString()
}

export class GoogleAdsGateway {
  async exchangeAuthorizationCode(
    connectionId: string,
    authorizationCode?: string
  ): Promise<GoogleAdsOAuthTokenResponseDto> {
    const codeSeed = authorizationCode ?? "default"
    return {
      access_token: `google_ads_access_${connectionId}_${codeSeed}`,
      refresh_token: `google_ads_refresh_${connectionId}_${codeSeed}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async refreshAccessToken(
    connectionId: string,
    refreshToken?: RefreshToken
  ): Promise<GoogleAdsOAuthTokenResponseDto> {
    const tokenSeed = refreshToken?.value ?? "seed"
    return {
      access_token: `google_ads_access_${connectionId}_${Date.now()}_${tokenSeed}`,
      refresh_token: `google_ads_refresh_${connectionId}_${Date.now()}`,
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

  async fetchAccounts(mode: "initial" | "incremental"): Promise<GoogleAdsAccountDto[]> {
    const accounts: GoogleAdsAccountDto[] = [
      {
        customer_id: "cust_1",
        manager_customer_id: "mcc_1",
        customer_name: "Madar Retail",
        manager_name: "Madar Holdings MCC",
        currency: "SAR",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      accounts.push({
        customer_id: "cust_2",
        manager_customer_id: "mcc_1",
        customer_name: "Madar Wholesale",
        manager_name: "Madar Holdings MCC",
        currency: "SAR",
        updated_at: nowIso(),
      })
    }

    return accounts
  }

  async fetchCampaigns(mode: "initial" | "incremental"): Promise<GoogleAdsCampaignDto[]> {
    const campaigns: GoogleAdsCampaignDto[] = [
      {
        campaign_id: "gcmp_1",
        customer_id: "cust_1",
        name: "Search Brand",
        status: "ENABLED",
        channel_type: "SEARCH",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      campaigns.push({
        campaign_id: "gcmp_2",
        customer_id: "cust_1",
        name: "Performance Max",
        status: "PAUSED",
        channel_type: "PERFORMANCE_MAX",
        updated_at: nowIso(),
      })
    }

    return campaigns
  }

  async fetchAdGroups(mode: "initial" | "incremental"): Promise<GoogleAdsAdGroupDto[]> {
    const adGroups: GoogleAdsAdGroupDto[] = [
      {
        ad_group_id: "gag_1",
        campaign_id: "gcmp_1",
        name: "Brand Core",
        status: "ENABLED",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      adGroups.push({
        ad_group_id: "gag_2",
        campaign_id: "gcmp_2",
        name: "PMax Asset Group",
        status: "PAUSED",
        updated_at: nowIso(),
      })
    }

    return adGroups
  }

  async fetchAds(mode: "initial" | "incremental"): Promise<GoogleAdsAdDto[]> {
    const ads: GoogleAdsAdDto[] = [
      {
        ad_id: "gad_1",
        ad_group_id: "gag_1",
        campaign_id: "gcmp_1",
        name: "Brand RSA",
        status: "ENABLED",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      ads.push({
        ad_id: "gad_2",
        ad_group_id: "gag_2",
        campaign_id: "gcmp_2",
        name: "PMax Headline Set",
        status: "PAUSED",
        updated_at: nowIso(),
      })
    }

    return ads
  }

  async fetchKeywords(mode: "initial" | "incremental"): Promise<GoogleAdsKeywordDto[]> {
    const keywords: GoogleAdsKeywordDto[] = [
      {
        keyword_id: "gkw_1",
        ad_group_id: "gag_1",
        campaign_id: "gcmp_1",
        text: "madar platform",
        match_type: "EXACT",
        status: "ENABLED",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      keywords.push({
        keyword_id: "gkw_2",
        ad_group_id: "gag_1",
        campaign_id: "gcmp_1",
        text: "madar marketing",
        match_type: "PHRASE",
        status: "ENABLED",
        updated_at: nowIso(),
      })
    }

    return keywords
  }

  async fetchPerformanceMetrics(
    mode: "initial" | "incremental"
  ): Promise<GoogleAdsPerformanceMetricDto[]> {
    const metrics: GoogleAdsPerformanceMetricDto[] = [
      {
        campaign_id: "gcmp_1",
        ad_group_id: "gag_1",
        ad_id: "gad_1",
        keyword: "madar platform",
        match_type: "EXACT",
        device: "MOBILE",
        network: "SEARCH",
        cost: 1400,
        clicks: 2300,
        impressions: 54000,
        ctr: 4.26,
        cpc: 0.61,
        cpm: 25.92,
        conversions: 88,
        conversion_value: 26400,
        roas: 18.86,
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      metrics.push({
        campaign_id: "gcmp_2",
        ad_group_id: "gag_2",
        ad_id: "gad_2",
        keyword: "pmax_audience",
        match_type: "BROAD",
        device: "DESKTOP",
        network: "DISPLAY",
        cost: 980,
        clicks: 940,
        impressions: 43000,
        ctr: 2.18,
        cpc: 1.04,
        cpm: 22.79,
        conversions: 31,
        conversion_value: 9900,
        roas: 10.1,
        updated_at: nowIso(),
      })
    }

    return metrics
  }
}
