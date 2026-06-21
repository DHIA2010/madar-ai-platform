import { beforeEach, describe, expect, it } from "vitest"

import {
  SnapchatAdsAuthentication,
  SnapchatAdsGateway,
  SnapchatAdsMapper,
  createIntegrationRepository,
  resetIntegrationRepositoryState,
} from "@/infrastructure"

import { IntegrationApplicationService } from "../services"

function createService() {
  return new IntegrationApplicationService(createIntegrationRepository())
}

describe("snapchat ads connector", () => {
  beforeEach(() => {
    resetIntegrationRepositoryState()
  })

  it("supports oauth authorize, callback handling, refresh token, and token validation", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_snapchat",
      connectorDefinitionId: "connector_def_snapchat_ads",
      connectorId: "snapchat_ads_connector_1",
      credential: {
        type: "oauth",
        payload: {
          clientId: "snapchat_client",
          clientSecret: "snapchat_secret",
          redirectUri: "https://example.com/callback",
        },
      },
    })

    const authorized = await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_1",
    })

    expect(authorized.payload.status).toBe("authorized")
    expect(authorized.payload.accessToken?.value.startsWith("snapchat_ads_access_")).toBe(true)
    expect(authorized.payload.refreshToken?.value.startsWith("snapchat_ads_refresh_")).toBe(true)

    const refreshed = await service.refreshConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(refreshed.payload.accessToken?.value).not.toBe(authorized.payload.accessToken?.value)
    expect(refreshed.payload.refreshToken?.value.startsWith("snapchat_ads_refresh_")).toBe(true)

    const validated = await service.validateConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(validated.payload.status).toBe("valid")

    const auth = new SnapchatAdsAuthentication(new SnapchatAdsGateway())
    const callbackTokens = await auth.handleCallback(
      connection.payload.connectionId,
      "callback_code_1"
    )
    expect(callbackTokens.accessToken.value.startsWith("snapchat_ads_access_")).toBe(true)
    expect(callbackTokens.refreshToken.value.startsWith("snapchat_ads_refresh_")).toBe(true)
  })

  it("maps account, organization, campaign, ad squad, ad, creative, performance, and conversion dto payloads into canonical models", () => {
    const adAccount = SnapchatAdsMapper.mapAdAccount({
      ad_account_id: "sc_acc_1",
      ad_account_name: "Madar Snapchat Main",
      organization_id: "sc_org_1",
      currency: "SAR",
      timezone: "Asia/Riyadh",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(adAccount.adAccountId).toBe("sc_acc_1")

    const organization = SnapchatAdsMapper.mapOrganization({
      organization_id: "sc_org_1",
      organization_name: "Madar Snap Org",
      country: "SA",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(organization.organizationId).toBe("sc_org_1")

    const campaign = SnapchatAdsMapper.mapCampaign({
      campaign_id: "sc_cmp_1",
      ad_account_id: "sc_acc_1",
      name: "Snap Prospecting",
      status: "ACTIVE",
      objective: "PURCHASE",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(campaign.campaignId).toBe("sc_cmp_1")

    const adSquad = SnapchatAdsMapper.mapAdSquad({
      ad_squad_id: "sc_sq_1",
      campaign_id: "sc_cmp_1",
      name: "KSA Broad Audience",
      status: "ACTIVE",
      audience: "broad:ksa",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(adSquad.adSquadId).toBe("sc_sq_1")

    const ad = SnapchatAdsMapper.mapAd({
      ad_id: "sc_ad_1",
      ad_squad_id: "sc_sq_1",
      campaign_id: "sc_cmp_1",
      creative_id: "sc_cr_1",
      name: "Snap UGC Video",
      status: "ACTIVE",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(ad.adId).toBe("sc_ad_1")

    const creative = SnapchatAdsMapper.mapCreative({
      creative_id: "sc_cr_1",
      ad_squad_id: "sc_sq_1",
      ad_id: "sc_ad_1",
      name: "Snap Creative A",
      format: "VIDEO",
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(creative.creativeId).toBe("sc_cr_1")

    const performance = SnapchatAdsMapper.mapPerformance({
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
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(performance.swipeUps).toBe(840)

    const conversion = SnapchatAdsMapper.mapConversion({
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
      updated_at: "2026-06-19T08:00:00.000Z",
    })
    expect(conversion.purchaseValue).toBe(11600)
  })

  it("supports initial and incremental sync triggers", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_snapchat_sync",
      connectorDefinitionId: "connector_def_snapchat_ads",
      connectorId: "snapchat_ads_connector_sync",
      credential: {
        type: "oauth",
        payload: {
          clientId: "snapchat_client",
          clientSecret: "snapchat_secret",
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
      workspaceId: "ws_snapchat_retry",
      connectorDefinitionId: "connector_def_snapchat_ads",
      connectorId: "snapchat_ads_connector_retry",
      credential: {
        type: "oauth",
        payload: {
          clientId: "snapchat_client",
          clientSecret: "snapchat_secret",
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

  it("enforces repository oauth guardrails for snapchat ads", async () => {
    const service = createService()

    await expect(
      service.createConnection({
        workspaceId: "ws_invalid",
        connectorDefinitionId: "connector_def_snapchat_ads",
        connectorId: "snapchat_ads_connector_invalid",
      })
    ).rejects.toThrow("Snapchat Ads connector requires OAuth credential payload")
  })
})
