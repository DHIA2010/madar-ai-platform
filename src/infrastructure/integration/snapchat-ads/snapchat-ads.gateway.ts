import type { AccessToken, RefreshToken } from "@/application/contracts/integration.contracts"

import type {
  SnapchatAdsAdAccountDto,
  SnapchatAdsAdDto,
  SnapchatAdsAdSquadDto,
  SnapchatAdsCampaignDto,
  SnapchatAdsConversionMetricDto,
  SnapchatAdsCreativeDto,
  SnapchatAdsOAuthTokenResponseDto,
  SnapchatAdsOrganizationDto,
  SnapchatAdsPerformanceMetricDto,
} from "./snapchat-ads.dtos"

function nowIso() {
  return new Date().toISOString()
}

export class SnapchatAdsGateway {
  async exchangeAuthorizationCode(
    connectionId: string,
    authorizationCode?: string
  ): Promise<SnapchatAdsOAuthTokenResponseDto> {
    const codeSeed = authorizationCode ?? "default"
    return {
      access_token: `snapchat_ads_access_${connectionId}_${codeSeed}`,
      refresh_token: `snapchat_ads_refresh_${connectionId}_${codeSeed}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async refreshAccessToken(
    connectionId: string,
    refreshToken?: RefreshToken
  ): Promise<SnapchatAdsOAuthTokenResponseDto> {
    const tokenSeed = refreshToken?.value ?? "seed"
    return {
      access_token: `snapchat_ads_access_${connectionId}_${Date.now()}_${tokenSeed}`,
      refresh_token: `snapchat_ads_refresh_${connectionId}_${Date.now()}`,
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

  async fetchAdAccounts(mode: "initial" | "incremental"): Promise<SnapchatAdsAdAccountDto[]> {
    const adAccounts: SnapchatAdsAdAccountDto[] = [
      {
        ad_account_id: "sc_acc_1",
        ad_account_name: "Madar Snapchat Main",
        organization_id: "sc_org_1",
        currency: "SAR",
        timezone: "Asia/Riyadh",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      adAccounts.push({
        ad_account_id: "sc_acc_2",
        ad_account_name: "Madar Snapchat Growth",
        organization_id: "sc_org_2",
        currency: "SAR",
        timezone: "Asia/Riyadh",
        updated_at: nowIso(),
      })
    }

    return adAccounts
  }

  async fetchOrganizations(mode: "initial" | "incremental"): Promise<SnapchatAdsOrganizationDto[]> {
    const organizations: SnapchatAdsOrganizationDto[] = [
      {
        organization_id: "sc_org_1",
        organization_name: "Madar Snap Org",
        country: "SA",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      organizations.push({
        organization_id: "sc_org_2",
        organization_name: "Madar Snap Expansion Org",
        country: "SA",
        updated_at: nowIso(),
      })
    }

    return organizations
  }

  async fetchCampaigns(mode: "initial" | "incremental"): Promise<SnapchatAdsCampaignDto[]> {
    const campaigns: SnapchatAdsCampaignDto[] = [
      {
        campaign_id: "sc_cmp_1",
        ad_account_id: "sc_acc_1",
        name: "Snap Prospecting",
        status: "ACTIVE",
        objective: "PURCHASE",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      campaigns.push({
        campaign_id: "sc_cmp_2",
        ad_account_id: "sc_acc_1",
        name: "Snap Retargeting",
        status: "PAUSED",
        objective: "TRAFFIC",
        updated_at: nowIso(),
      })
    }

    return campaigns
  }

  async fetchAdSquads(mode: "initial" | "incremental"): Promise<SnapchatAdsAdSquadDto[]> {
    const adSquads: SnapchatAdsAdSquadDto[] = [
      {
        ad_squad_id: "sc_sq_1",
        campaign_id: "sc_cmp_1",
        name: "KSA Broad Audience",
        status: "ACTIVE",
        audience: "broad:ksa",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      adSquads.push({
        ad_squad_id: "sc_sq_2",
        campaign_id: "sc_cmp_2",
        name: "Visitors 14d",
        status: "PAUSED",
        audience: "retargeting:visitors_14d",
        updated_at: nowIso(),
      })
    }

    return adSquads
  }

  async fetchAds(mode: "initial" | "incremental"): Promise<SnapchatAdsAdDto[]> {
    const ads: SnapchatAdsAdDto[] = [
      {
        ad_id: "sc_ad_1",
        ad_squad_id: "sc_sq_1",
        campaign_id: "sc_cmp_1",
        creative_id: "sc_cr_1",
        name: "Snap UGC Video",
        status: "ACTIVE",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      ads.push({
        ad_id: "sc_ad_2",
        ad_squad_id: "sc_sq_2",
        campaign_id: "sc_cmp_2",
        creative_id: "sc_cr_2",
        name: "Snap Offer Story",
        status: "PAUSED",
        updated_at: nowIso(),
      })
    }

    return ads
  }

  async fetchCreatives(mode: "initial" | "incremental"): Promise<SnapchatAdsCreativeDto[]> {
    const creatives: SnapchatAdsCreativeDto[] = [
      {
        creative_id: "sc_cr_1",
        ad_squad_id: "sc_sq_1",
        ad_id: "sc_ad_1",
        name: "Snap Creative A",
        format: "VIDEO",
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      creatives.push({
        creative_id: "sc_cr_2",
        ad_squad_id: "sc_sq_2",
        ad_id: "sc_ad_2",
        name: "Snap Creative B",
        format: "STORY",
        updated_at: nowIso(),
      })
    }

    return creatives
  }

  async fetchPerformanceMetrics(
    mode: "initial" | "incremental"
  ): Promise<SnapchatAdsPerformanceMetricDto[]> {
    const metrics: SnapchatAdsPerformanceMetricDto[] = [
      {
        campaign_id: "sc_cmp_1",
        ad_squad_id: "sc_sq_1",
        ad_id: "sc_ad_1",
        placement: "snap_feed",
        device: "mobile",
        audience: "broad:ksa",
        source: "snapchat_ads",
        spend: 1200,
        impressions: 46000,
        reach: 32000,
        swipe_ups: 840,
        clicks: 1500,
        ctr: 3.26,
        cpc: 0.8,
        cpm: 26.09,
        video_views: 21000,
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      metrics.push({
        campaign_id: "sc_cmp_2",
        ad_squad_id: "sc_sq_2",
        ad_id: "sc_ad_2",
        placement: "snap_story",
        device: "mobile",
        audience: "retargeting:visitors_14d",
        source: "snapchat_ads",
        spend: 640,
        impressions: 24000,
        reach: 16000,
        swipe_ups: 390,
        clicks: 710,
        ctr: 2.95,
        cpc: 0.9,
        cpm: 26.67,
        video_views: 9800,
        updated_at: nowIso(),
      })
    }

    return metrics
  }

  async fetchConversionMetrics(
    mode: "initial" | "incremental"
  ): Promise<SnapchatAdsConversionMetricDto[]> {
    const metrics: SnapchatAdsConversionMetricDto[] = [
      {
        campaign_id: "sc_cmp_1",
        ad_squad_id: "sc_sq_1",
        ad_id: "sc_ad_1",
        placement: "snap_feed",
        device: "mobile",
        audience: "broad:ksa",
        source: "snapchat_ads",
        purchases: 35,
        purchase_value: 11600,
        leads: 74,
        add_to_cart: 160,
        start_checkout: 62,
        updated_at: nowIso(),
      },
    ]

    if (mode === "initial") {
      metrics.push({
        campaign_id: "sc_cmp_2",
        ad_squad_id: "sc_sq_2",
        ad_id: "sc_ad_2",
        placement: "snap_story",
        device: "mobile",
        audience: "retargeting:visitors_14d",
        source: "snapchat_ads",
        purchases: 14,
        purchase_value: 4800,
        leads: 29,
        add_to_cart: 63,
        start_checkout: 22,
        updated_at: nowIso(),
      })
    }

    return metrics
  }
}
