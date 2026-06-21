import { beforeEach, describe, expect, it } from "vitest"

import {
  createIntegrationRepository,
  resetIntegrationRepositoryState,
  SallaMapper,
  SallaWebhookParser,
} from "@/infrastructure"

import { IntegrationApplicationService } from "../services"

function createService() {
  return new IntegrationApplicationService(createIntegrationRepository())
}

describe("salla connector", () => {
  beforeEach(() => {
    resetIntegrationRepositoryState()
  })

  it("supports oauth authorize and refresh token flow", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_salla",
      connectorDefinitionId: "connector_def_salla",
      connectorId: "salla_connector_1",
      credential: {
        type: "oauth",
        payload: {
          clientId: "salla_client",
          clientSecret: "salla_secret",
          redirectUri: "https://example.com/callback",
        },
      },
    })

    const authorized = await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_1",
    })

    expect(authorized.payload.status).toBe("authorized")
    expect(authorized.payload.accessToken?.value.startsWith("salla_access_")).toBe(true)
    expect(authorized.payload.refreshToken?.value.startsWith("salla_refresh_")).toBe(true)

    const refreshed = await service.refreshConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(refreshed.payload.accessToken?.value).not.toBe(authorized.payload.accessToken?.value)
    expect(refreshed.payload.refreshToken?.value.startsWith("salla_refresh_")).toBe(true)

    const validated = await service.validateConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(validated.payload.status).toBe("valid")
  })

  it("maps product, order, and customer dto payloads to canonical models", () => {
    const product = SallaMapper.mapProduct({
      id: "p1",
      name: "Salla Product",
      sku: "SAL-1",
      price: 99,
      currency: "SAR",
      quantity: 7,
      category_ids: ["cat-1"],
      brand: "SallaBrand",
      collection_ids: ["col-1"],
      updated_at: "2026-06-19T08:00:00.000Z",
    })

    expect(product.title).toBe("Salla Product")
    expect(product.inventory).toBe(7)

    const order = SallaMapper.mapOrder({
      id: "o1",
      customer_id: "c1",
      total: 500,
      currency: "SAR",
      status: "paid",
      discount_total: 50,
      items_count: 4,
      created_at: "2026-06-19T08:00:00.000Z",
      updated_at: "2026-06-19T09:00:00.000Z",
    })

    expect(order.customerId).toBe("c1")
    expect(order.itemCount).toBe(4)

    const customer = SallaMapper.mapCustomer({
      id: "c1",
      email: "buyer@salla.test",
      phone: "+966500000123",
      first_name: "Nora",
      last_name: "K",
      created_at: "2026-06-19T08:00:00.000Z",
      updated_at: "2026-06-19T09:00:00.000Z",
    })

    expect(customer.fullName).toBe("Nora K")
    expect(customer.email).toBe("buyer@salla.test")
  })

  it("supports initial and incremental sync behavior", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_salla_sync",
      connectorDefinitionId: "connector_def_salla",
      connectorId: "salla_connector_sync",
      credential: {
        type: "oauth",
        payload: {
          clientId: "salla_client",
          clientSecret: "salla_secret",
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

  it("parses supported webhook payloads and supports webhook/manual retry path", async () => {
    const parser = new SallaWebhookParser()
    const parsed = parser.parse({
      event: "order.updated",
      data: { id: "ord_1", updated_at: "2026-06-19T10:00:00.000Z" },
    })

    expect(parsed.eventType).toBe("order.updated")
    expect(parsed.resourceId).toBe("ord_1")

    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_salla_webhook",
      connectorDefinitionId: "connector_def_salla",
      connectorId: "salla_connector_webhook",
      metadata: {
        sallaWebhookEvent: "product.updated",
        sallaWebhookResourceId: "prod_77",
      },
      credential: {
        type: "oauth",
        payload: {
          clientId: "salla_client",
          clientSecret: "salla_secret",
        },
      },
    })

    await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_wh",
    })

    const webhookRun = await service.runSync({
      connectionId: connection.payload.connectionId,
      trigger: "webhook",
    })

    expect(webhookRun.payload.result?.message).toContain("webhook")

    const paused = await service.pauseSync({ syncJobId: webhookRun.payload.syncJobId })
    expect(paused.status).toBe("paused")

    await service.resumeSync({ syncJobId: webhookRun.payload.syncJobId })
    const retried = await service.retrySync({ syncJobId: webhookRun.payload.syncJobId })

    expect(retried.payload.status).toBe("completed")
    expect(retried.payload.attempt).toBe(2)
  })

  it("enforces repository oauth constraints for salla", async () => {
    const service = createService()

    await expect(
      service.createConnection({
        workspaceId: "ws_invalid",
        connectorDefinitionId: "connector_def_salla",
        connectorId: "salla_connector_invalid",
      })
    ).rejects.toThrow("Salla connector requires OAuth credential payload")
  })
})
