import { beforeEach, describe, expect, it } from "vitest"

import {
  TikTokAdsAuthentication,
  TikTokAdsGateway,
  TikTokAdsMapper,
  createIntegrationRepository,
  resetIntegrationRepositoryState,
} from "@/infrastructure"

import { IntegrationApplicationService } from "../services"

function createService() {
  return new IntegrationApplicationService(createIntegrationRepository())
}

describe("tiktok ads connector", () => {
  beforeEach(() => {
    resetIntegrationRepositoryState()
  })

  it("supports oauth authorize, callback handling, refresh token, and token validation", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_tiktok",
      connectorDefinitionId: "connector_def_tiktok_ads",
      connectorId: "tiktok_ads_connector_1",
      credential: {
        type: "oauth",
        payload: {
          clientId: "tiktok_client",
          clientSecret: "tiktok_secret",
          redirectUri: "https://example.com/callback",
        },
      },
    })

    const authorized = await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_1",
    })

    expect(authorized.payload.status).toBe("authorized")
    expect(authorized.payload.accessToken?.value.startsWith("tiktok_ads_access_")).toBe(true)
    expect(authorized.payload.refreshToken?.value.startsWith("tiktok_ads_refresh_")).toBe(true)

    const refreshed = await service.refreshConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(refreshed.payload.accessToken?.value).not.toBe(authorized.payload.accessToken?.value)
    expect(refreshed.payload.refreshToken?.value.startsWith("tiktok_ads_refresh_")).toBe(true)

    const validated = await service.validateConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(validated.payload.status).toBe("valid")

    const auth = new TikTokAdsAuthentication(new TikTokAdsGateway())
    const callbackTokens = await auth.handleCallback(
      connection.payload.connectionId,
      "callback_code_1"
    )
    expect(callbackTokens.accessToken.value.startsWith("tiktok_ads_access_")).toBe(true)
    expect(callbackTokens.refreshToken.value.startsWith("tiktok_ads_refresh_")).toBe(true)
  })

  it("maps account, business center, campaign, ad group, ad, creative, performance, and conversion dto payloads into canonical models", () => {
    const advertiserAccount = TikTokAdsMapper.mapAdvertiserAccount({
      advertiser_id: "tt_adv_1",
      advertiser_name: "Madar TikTok Main",
      currency: "SAR",
      timezone: "Asia/Riyadh",
      business_center_id: "tt_bc_1",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(advertiserAccount.advertiserId).toBe("tt_adv_1")

    const businessCenter = TikTokAdsMapper.mapBusinessCenter({
      business_center_id: "tt_bc_1",
      business_center_name: "Madar Group BC",
      country: "SA",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(businessCenter.businessCenterId).toBe("tt_bc_1")

    const campaign = TikTokAdsMapper.mapCampaign({
      campaign_id: "tt_cmp_1",
      advertiser_id: "tt_adv_1",
      name: "TikTok Prospecting",
      status: "ACTIVE",
      objective_type: "CONVERSIONS",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(campaign.campaignId).toBe("tt_cmp_1")

    const adGroup = TikTokAdsMapper.mapAdGroup({
      ad_group_id: "tt_ag_1",
      campaign_id: "tt_cmp_1",
      name: "KSA Interest Audience",
      status: "ACTIVE",
      audience: "interest:marketing",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(adGroup.adGroupId).toBe("tt_ag_1")

    const ad = TikTokAdsMapper.mapAd({
      ad_id: "tt_ad_1",
      ad_group_id: "tt_ag_1",
      campaign_id: "tt_cmp_1",
      creative_id: "tt_cr_1",
      name: "Creator Clip 15s",
      status: "ACTIVE",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(ad.adId).toBe("tt_ad_1")

    const creative = TikTokAdsMapper.mapCreative({
      creative_id: "tt_cr_1",
      ad_group_id: "tt_ag_1",
      ad_id: "tt_ad_1",
      name: "UGC Creative A",
      format: "VIDEO",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(creative.creativeId).toBe("tt_cr_1")

    const performance = TikTokAdsMapper.mapPerformance({
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
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(performance.videoViews).toBe(24000)

    const conversion = TikTokAdsMapper.mapConversion({
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
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(conversion.purchaseValue).toBe(14500)
  })

  it("supports initial and incremental sync triggers", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_tiktok_sync",
      connectorDefinitionId: "connector_def_tiktok_ads",
      connectorId: "tiktok_ads_connector_sync",
      credential: {
        type: "oauth",
        payload: {
          clientId: "tiktok_client",
          clientSecret: "tiktok_secret",
        },
      },
    })

    await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_sync",
    })

    const firstRun = await service.runSync({
      connectionId: connection.payload.connectionId,
      trigger: "scheduled",
    })

    expect(firstRun.payload.result?.message).toContain("initial")

    const secondRun = await service.runSync({
      connectionId: connection.payload.connectionId,
      trigger: "scheduled",
    })

    expect(secondRun.payload.result?.message).toContain("incremental")
    expect(secondRun.payload.result?.recordsRead).toBeLessThan(
      firstRun.payload.result?.recordsRead ?? 999
    )
  })

  it("supports retry behavior through the existing retry engine flow", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_tiktok_retry",
      connectorDefinitionId: "connector_def_tiktok_ads",
      connectorId: "tiktok_ads_connector_retry",
      credential: {
        type: "oauth",
        payload: {
          clientId: "tiktok_client",
          clientSecret: "tiktok_secret",
        },
      },
    })

    await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_retry",
    })

    const run = await service.runSync({
      connectionId: connection.payload.connectionId,
      trigger: "manual",
    })

    const paused = await service.pauseSync({ syncJobId: run.payload.syncJobId })
    expect(paused.status).toBe("paused")

    await service.resumeSync({ syncJobId: run.payload.syncJobId })
    const retried = await service.retrySync({ syncJobId: run.payload.syncJobId })

    expect(retried.payload.status).toBe("completed")
    expect(retried.payload.attempt).toBe(2)
  })

  it("enforces repository oauth guardrails for tiktok ads", async () => {
    const service = createService()

    await expect(
      service.createConnection({
        workspaceId: "ws_invalid",
        connectorDefinitionId: "connector_def_tiktok_ads",
        connectorId: "tiktok_ads_connector_invalid",
      })
    ).rejects.toThrow("TikTok Ads connector requires OAuth credential payload")
  })
})
