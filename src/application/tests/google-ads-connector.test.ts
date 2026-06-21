import { beforeEach, describe, expect, it } from "vitest"

import {
  createIntegrationRepository,
  GoogleAdsAuthentication,
  GoogleAdsGateway,
  GoogleAdsMapper,
  resetIntegrationRepositoryState,
} from "@/infrastructure"

import { IntegrationApplicationService } from "../services"

function createService() {
  return new IntegrationApplicationService(createIntegrationRepository())
}

describe("google ads connector", () => {
  beforeEach(() => {
    resetIntegrationRepositoryState()
  })

  it("supports oauth authorize, callback handling, refresh token, and token validation", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_google",
      connectorDefinitionId: "connector_def_google_ads",
      connectorId: "google_ads_connector_1",
      credential: {
        type: "oauth",
        payload: {
          clientId: "google_client",
          clientSecret: "google_secret",
          redirectUri: "https://example.com/callback",
        },
      },
    })

    const authorized = await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_1",
    })

    expect(authorized.payload.status).toBe("authorized")
    expect(authorized.payload.accessToken?.value.startsWith("google_ads_access_")).toBe(true)
    expect(authorized.payload.refreshToken?.value.startsWith("google_ads_refresh_")).toBe(true)

    const refreshed = await service.refreshConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(refreshed.payload.accessToken?.value).not.toBe(authorized.payload.accessToken?.value)
    expect(refreshed.payload.refreshToken?.value.startsWith("google_ads_refresh_")).toBe(true)

    const validated = await service.validateConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(validated.payload.status).toBe("valid")

    const auth = new GoogleAdsAuthentication(new GoogleAdsGateway())
    const callbackTokens = await auth.handleCallback(
      connection.payload.connectionId,
      "callback_code_1"
    )
    expect(callbackTokens.accessToken.value.startsWith("google_ads_access_")).toBe(true)
    expect(callbackTokens.refreshToken.value.startsWith("google_ads_refresh_")).toBe(true)
  })

  it("maps account, campaign, ad group, ad, keyword, and performance dto payloads into canonical models", () => {
    const account = GoogleAdsMapper.mapAccount({
      customer_id: "cust_1",
      manager_customer_id: "mcc_1",
      customer_name: "Madar Retail",
      manager_name: "Madar Holdings MCC",
      currency: "SAR",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(account.customerId).toBe("cust_1")

    const campaign = GoogleAdsMapper.mapCampaign({
      campaign_id: "gcmp_1",
      customer_id: "cust_1",
      name: "Search Brand",
      status: "ENABLED",
      channel_type: "SEARCH",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(campaign.campaignId).toBe("gcmp_1")

    const adGroup = GoogleAdsMapper.mapAdGroup({
      ad_group_id: "gag_1",
      campaign_id: "gcmp_1",
      name: "Brand Core",
      status: "ENABLED",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(adGroup.adGroupId).toBe("gag_1")

    const ad = GoogleAdsMapper.mapAd({
      ad_id: "gad_1",
      ad_group_id: "gag_1",
      campaign_id: "gcmp_1",
      name: "Brand RSA",
      status: "ENABLED",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(ad.adId).toBe("gad_1")

    const keyword = GoogleAdsMapper.mapKeyword({
      keyword_id: "gkw_1",
      ad_group_id: "gag_1",
      campaign_id: "gcmp_1",
      text: "madar platform",
      match_type: "EXACT",
      status: "ENABLED",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(keyword.keywordId).toBe("gkw_1")

    const performance = GoogleAdsMapper.mapPerformance({
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
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(performance.conversionValue).toBe(26400)
  })

  it("supports initial and incremental sync triggers", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_google_sync",
      connectorDefinitionId: "connector_def_google_ads",
      connectorId: "google_ads_connector_sync",
      credential: {
        type: "oauth",
        payload: {
          clientId: "google_client",
          clientSecret: "google_secret",
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
      workspaceId: "ws_google_retry",
      connectorDefinitionId: "connector_def_google_ads",
      connectorId: "google_ads_connector_retry",
      credential: {
        type: "oauth",
        payload: {
          clientId: "google_client",
          clientSecret: "google_secret",
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

  it("enforces repository oauth guardrails for google ads", async () => {
    const service = createService()

    await expect(
      service.createConnection({
        workspaceId: "ws_invalid",
        connectorDefinitionId: "connector_def_google_ads",
        connectorId: "google_ads_connector_invalid",
      })
    ).rejects.toThrow("Google Ads connector requires OAuth credential payload")
  })
})
