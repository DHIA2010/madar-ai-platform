import { beforeEach, describe, expect, it } from "vitest"

import {
  createIntegrationRepository,
  MetaAdsAuthentication,
  MetaAdsGateway,
  MetaAdsMapper,
  resetIntegrationRepositoryState,
} from "@/infrastructure"

import { IntegrationApplicationService } from "../services"

function createService() {
  return new IntegrationApplicationService(createIntegrationRepository())
}

describe("meta ads connector", () => {
  beforeEach(() => {
    resetIntegrationRepositoryState()
  })

  it("supports oauth authorize, callback handling, refresh token, and token validation", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_meta",
      connectorDefinitionId: "connector_def_meta_ads",
      connectorId: "meta_ads_connector_1",
      credential: {
        type: "oauth",
        payload: {
          clientId: "meta_client",
          clientSecret: "meta_secret",
          redirectUri: "https://example.com/callback",
        },
      },
    })

    const authorized = await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_1",
    })

    expect(authorized.payload.status).toBe("authorized")
    expect(authorized.payload.accessToken?.value.startsWith("meta_access_")).toBe(true)
    expect(authorized.payload.refreshToken?.value.startsWith("meta_refresh_")).toBe(true)

    const refreshed = await service.refreshConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(refreshed.payload.accessToken?.value).not.toBe(authorized.payload.accessToken?.value)
    expect(refreshed.payload.refreshToken?.value.startsWith("meta_refresh_")).toBe(true)

    const validated = await service.validateConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(validated.payload.status).toBe("valid")

    const auth = new MetaAdsAuthentication(new MetaAdsGateway())
    const callbackTokens = await auth.handleCallback(
      connection.payload.connectionId,
      "callback_code_1"
    )
    expect(callbackTokens.accessToken.value.startsWith("meta_access_")).toBe(true)
    expect(callbackTokens.refreshToken.value.startsWith("meta_refresh_")).toBe(true)
  })

  it("maps campaign, ad set, ad, metrics, and conversion dto payloads into canonical models", () => {
    const campaign = MetaAdsMapper.mapCampaign({
      campaign_id: "cmp_1",
      account_id: "act_1",
      name: "Campaign",
      status: "ACTIVE",
      objective: "CONVERSIONS",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(campaign.campaignId).toBe("cmp_1")

    const adSet = MetaAdsMapper.mapAdSet({
      ad_set_id: "adset_1",
      campaign_id: "cmp_1",
      name: "Ad Set",
      status: "ACTIVE",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(adSet.adSetId).toBe("adset_1")

    const ad = MetaAdsMapper.mapAd({
      ad_id: "ad_1",
      ad_set_id: "adset_1",
      campaign_id: "cmp_1",
      name: "Ad",
      status: "ACTIVE",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(ad.adId).toBe("ad_1")

    const performance = MetaAdsMapper.mapPerformance({
      campaign_id: "cmp_1",
      ad_set_id: "adset_1",
      ad_id: "ad_1",
      spend: 100,
      impressions: 1000,
      reach: 700,
      clicks: 50,
      link_clicks: 30,
      ctr: 5,
      cpc: 2,
      cpm: 10,
      frequency: 1.2,
      source: "meta",
      medium: "paid_social",
      placement: "facebook_feed",
      date: "2026-06-19",
    })
    expect(performance.linkClicks).toBe(30)

    const conversion = MetaAdsMapper.mapConversion({
      campaign_id: "cmp_1",
      ad_set_id: "adset_1",
      ad_id: "ad_1",
      purchases: 5,
      purchase_value: 800,
      leads: 12,
      add_to_cart: 20,
      initiate_checkout: 8,
      view_content: 140,
      source: "meta",
      medium: "paid_social",
      placement: "facebook_feed",
      date: "2026-06-19",
    })
    expect(conversion.purchaseValue).toBe(800)
  })

  it("supports incremental sync and scheduled/manual sync triggers", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_meta_sync",
      connectorDefinitionId: "connector_def_meta_ads",
      connectorId: "meta_ads_connector_sync",
      credential: {
        type: "oauth",
        payload: {
          clientId: "meta_client",
          clientSecret: "meta_secret",
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
      workspaceId: "ws_meta_retry",
      connectorDefinitionId: "connector_def_meta_ads",
      connectorId: "meta_ads_connector_retry",
      credential: {
        type: "oauth",
        payload: {
          clientId: "meta_client",
          clientSecret: "meta_secret",
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

  it("enforces repository oauth guardrails for meta ads", async () => {
    const service = createService()

    await expect(
      service.createConnection({
        workspaceId: "ws_invalid",
        connectorDefinitionId: "connector_def_meta_ads",
        connectorId: "meta_ads_connector_invalid",
      })
    ).rejects.toThrow("Meta Ads connector requires OAuth credential payload")
  })
})
