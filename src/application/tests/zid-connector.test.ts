import { beforeEach, describe, expect, it } from "vitest"

import {
  createIntegrationRepository,
  resetIntegrationRepositoryState,
  ZidAuthentication,
  ZidGateway,
  ZidMapper,
  ZidWebhookParser,
} from "@/infrastructure"

import { IntegrationApplicationService } from "../services"

function createService() {
  return new IntegrationApplicationService(createIntegrationRepository())
}

describe("zid connector", () => {
  beforeEach(() => {
    resetIntegrationRepositoryState()
  })

  it("supports oauth authorize, callback handling, refresh token, and validation", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_zid",
      connectorDefinitionId: "connector_def_zid",
      connectorId: "zid_connector_1",
      credential: {
        type: "oauth",
        payload: {
          clientId: "zid_client",
          clientSecret: "zid_secret",
          redirectUri: "https://example.com/callback",
        },
      },
    })

    const authorized = await service.authorizeConnector({
      connectionId: connection.payload.connectionId,
      authorizationCode: "oauth_code_1",
    })

    expect(authorized.payload.status).toBe("authorized")
    expect(authorized.payload.accessToken?.value.startsWith("zid_access_")).toBe(true)
    expect(authorized.payload.refreshToken?.value.startsWith("zid_refresh_")).toBe(true)

    const refreshed = await service.refreshConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(refreshed.payload.accessToken?.value).not.toBe(authorized.payload.accessToken?.value)
    expect(refreshed.payload.refreshToken?.value.startsWith("zid_refresh_")).toBe(true)

    const validated = await service.validateConnection({
      connectionId: connection.payload.connectionId,
    })

    expect(validated.payload.status).toBe("valid")

    const auth = new ZidAuthentication(new ZidGateway())
    const callbackTokens = await auth.handleCallback(
      connection.payload.connectionId,
      "callback_code_1"
    )
    expect(callbackTokens.accessToken.value.startsWith("zid_access_")).toBe(true)
    expect(callbackTokens.refreshToken.value.startsWith("zid_refresh_")).toBe(true)
  })

  it("maps dto payloads into canonical models", () => {
    const product = ZidMapper.mapProduct({
      id: "p1",
      name: "Zid Product",
      sku: "ZID-1",
      price: 111,
      currency: "SAR",
      inventory_quantity: 14,
      category_ids: ["cat-1"],
      brand_id: "brand-1",
      collection_ids: ["col-1"],
      updated_at: "2026-06-19T08:00:00.000Z",
    })

    expect(product.title).toBe("Zid Product")
    expect(product.inventory).toBe(14)

    const order = ZidMapper.mapOrder({
      id: "o1",
      customer_id: "c1",
      total: 510,
      currency: "SAR",
      status: "paid",
      discount_total: 50,
      items_count: 4,
      created_at: "2026-06-19T08:00:00.000Z",
      updated_at: "2026-06-19T09:00:00.000Z",
    })

    expect(order.customerId).toBe("c1")
    expect(order.itemCount).toBe(4)

    const customer = ZidMapper.mapCustomer({
      id: "c1",
      email: "buyer@zid.test",
      phone: "+966500000123",
      first_name: "Nora",
      last_name: "K",
      created_at: "2026-06-19T08:00:00.000Z",
      updated_at: "2026-06-19T09:00:00.000Z",
    })

    expect(customer.fullName).toBe("Nora K")
    expect(customer.email).toBe("buyer@zid.test")

    const inventory = ZidMapper.mapInventory({
      product_id: "p1",
      sku: "ZID-1",
      quantity: 14,
      updated_at: "2026-06-19T09:00:00.000Z",
    })
    expect(inventory.productId).toBe("p1")

    const category = ZidMapper.mapCategory({
      id: "cat-1",
      name: "Category",
      updated_at: "2026-06-19T09:00:00.000Z",
    })
    expect(category.name).toBe("Category")

    const brand = ZidMapper.mapBrand({
      id: "brand-1",
      name: "Brand",
      updated_at: "2026-06-19T09:00:00.000Z",
    })
    expect(brand.id).toBe("brand-1")

    const collection = ZidMapper.mapCollection({
      id: "col-1",
      name: "Collection",
      updated_at: "2026-06-19T09:00:00.000Z",
    })
    expect(collection.name).toBe("Collection")
  })

  it("supports product/order/customer sync and incremental sync behavior", async () => {
    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_zid_sync",
      connectorDefinitionId: "connector_def_zid",
      connectorId: "zid_connector_sync",
      credential: {
        type: "oauth",
        payload: {
          clientId: "zid_client",
          clientSecret: "zid_secret",
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

  it("parses webhook events and supports webhook sync with retry behavior", async () => {
    const parser = new ZidWebhookParser()
    const parsed = parser.parse({
      event: "order.updated",
      data: { id: "ord_1", updated_at: "2026-06-19T10:00:00.000Z" },
    })

    expect(parsed.eventType).toBe("order.updated")
    expect(parsed.resourceId).toBe("ord_1")

    const service = createService()

    const connection = await service.createConnection({
      workspaceId: "ws_zid_webhook",
      connectorDefinitionId: "connector_def_zid",
      connectorId: "zid_connector_webhook",
      metadata: {
        zidWebhookEvent: "product.updated",
        zidWebhookResourceId: "prod_77",
      },
      credential: {
        type: "oauth",
        payload: {
          clientId: "zid_client",
          clientSecret: "zid_secret",
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

  it("enforces repository oauth guardrails for zid", async () => {
    const service = createService()

    await expect(
      service.createConnection({
        workspaceId: "ws_invalid",
        connectorDefinitionId: "connector_def_zid",
        connectorId: "zid_connector_invalid",
      })
    ).rejects.toThrow("Zid connector requires OAuth credential payload")
  })
})
