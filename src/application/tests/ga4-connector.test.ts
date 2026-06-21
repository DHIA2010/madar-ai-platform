import { beforeEach, describe, expect, it } from "vitest"

import {
  createIntegrationRepository,
  GA4Authentication,
  GA4Gateway,
  GA4Mapper,
  resetIntegrationRepositoryState,
} from "@/infrastructure"

import { IntegrationApplicationService } from "../services"

function createService() {
  return new IntegrationApplicationService(createIntegrationRepository())
}

describe("ga4 connector", () => {
  beforeEach(() => {
    resetIntegrationRepositoryState()
  })

  it("supports oauth authorize, callback handling, refresh token, and token validation", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_ga4",
      connectorDefinitionId: "connector_def_ga4",
      connectorId: "ga4_connector_1",
      credential: {
        type: "oauth",
        payload: {
          clientId: "ga4_client",
          clientSecret: "ga4_secret",
          redirectUri: "https://example.com/callback",
        },
      },
    })

    const authorized = await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_1",
    })

    expect(authorized.payload.status).toBe("authorized")
    expect(authorized.payload.accessToken?.value.startsWith("ga4_access_")).toBe(true)
    expect(authorized.payload.refreshToken?.value.startsWith("ga4_refresh_")).toBe(true)

    const refreshed = await service.refreshConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(refreshed.payload.accessToken?.value).not.toBe(authorized.payload.accessToken?.value)
    expect(refreshed.payload.refreshToken?.value.startsWith("ga4_refresh_")).toBe(true)

    const validated = await service.validateConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(validated.payload.status).toBe("valid")

    const auth = new GA4Authentication(new GA4Gateway())
    const callbackTokens = await auth.handleCallback(
      connection.payload.connectionId,
      "callback_code_1"
    )
    expect(callbackTokens.accessToken.value.startsWith("ga4_access_")).toBe(true)
    expect(callbackTokens.refreshToken.value.startsWith("ga4_refresh_")).toBe(true)
  })

  it("maps traffic, acquisition, ecommerce, and event dto payloads into canonical analytics models", () => {
    const traffic = GA4Mapper.mapTraffic({
      date: "2026-06-19",
      users: 100,
      new_users: 20,
      sessions: 140,
      engaged_sessions: 80,
      bounce_rate: 42.5,
    })

    expect(traffic.newUsers).toBe(20)
    expect(traffic.bounceRate).toBe(42.5)

    const acquisition = GA4Mapper.mapAcquisition({
      source: "google",
      medium: "organic",
      campaign: "brand",
      channel_group: "Organic Search",
      users: 60,
      sessions: 80,
    })

    expect(acquisition.channelGroup).toBe("Organic Search")

    const ecommerce = GA4Mapper.mapEcommerce({
      item_id: "sku_1",
      item_name: "Shirt",
      product_views: 90,
      add_to_cart: 25,
      begin_checkout: 10,
      purchases: 6,
      revenue: 1200,
      currency: "SAR",
    })

    expect(ecommerce.addToCart).toBe(25)
    expect(ecommerce.revenue).toBe(1200)

    const event = GA4Mapper.mapEvent({
      event_name: "purchase",
      event_count: 8,
    })

    expect(event.eventName).toBe("purchase")
    expect(event.eventCount).toBe(8)
  })

  it("supports traffic, acquisition, ecommerce metric sync and incremental sync behavior", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_ga4_sync",
      connectorDefinitionId: "connector_def_ga4",
      connectorId: "ga4_connector_sync",
      credential: {
        type: "oauth",
        payload: {
          clientId: "ga4_client",
          clientSecret: "ga4_secret",
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
    expect(firstRun.payload.result?.recordsRead).toBeGreaterThan(0)

    const secondRun = await service.runSync({
      connectionId: connection.payload.connectionId,
      trigger: "scheduled",
    })

    expect(secondRun.payload.result?.message).toContain("incremental")
    expect(secondRun.payload.result?.recordsRead).toBeLessThan(
      firstRun.payload.result?.recordsRead ?? 999
    )
  })

  it("supports retry behavior via existing retry flow", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_ga4_retry",
      connectorDefinitionId: "connector_def_ga4",
      connectorId: "ga4_connector_retry",
      credential: {
        type: "oauth",
        payload: {
          clientId: "ga4_client",
          clientSecret: "ga4_secret",
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

  it("enforces repository oauth guardrails for ga4", async () => {
    const service = createService()

    await expect(
      service.createConnection({
        workspaceId: "ws_invalid",
        connectorDefinitionId: "connector_def_ga4",
        connectorId: "ga4_connector_invalid",
      })
    ).rejects.toThrow("GA4 connector requires OAuth credential payload")
  })
})
