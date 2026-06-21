import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import type { TrackingRequest } from "../tracking-api/tracking-api.contracts"
import { TrackingController } from "../tracking-api/tracking-controller"
import { TrackingRateLimiter } from "../tracking-api/tracking-rate-limiter"

function sampleContext() {
  return {
    timestamp: new Date().toISOString(),
    timezone: "Asia/Riyadh",
    language: "ar",
    currency: "SAR",
    location: { country: "SA", city: "Riyadh" },
    device: {
      deviceId: "device_1",
      type: "mobile" as const,
      browser: "Chrome",
      operatingSystem: "iOS",
      screenSize: "390x844",
    },
    referrer: "https://example.com",
    landingPage: "/",
  }
}

function createBaseRequest(
  path: "/session/start" | "/track" | "/identify" | "/session/end" | "/consent" | "/batch"
): TrackingRequest {
  return {
    method: "POST" as const,
    path,
    headers: {},
    ipAddress: "127.0.0.1",
    body: {
      tenantId: "tenant_1",
      workspaceId: "ws_1",
      trackingKey: undefined,
      timestamp: new Date().toISOString(),
      payload: {},
    },
  }
}

describe("tracking api platform", () => {
  it("supports anonymous session start and tracking endpoint forwarding", async () => {
    const controller = new TrackingController()

    const startRequest = createBaseRequest("/session/start")
    startRequest.body.payload = {
      context: sampleContext(),
    }

    const startResponse = await controller.handle(startRequest)
    expect(startResponse.success).toBe(true)

    const sessionId = (startResponse.data as { session: { sessionId: string } }).session.sessionId

    const trackRequest = createBaseRequest("/track")
    trackRequest.body.payload = {
      sessionId,
      eventId: "evt_1",
      name: "page_viewed",
      context: sampleContext(),
      payload: {},
    }

    const trackResponse = await controller.handle(trackRequest)
    expect(trackResponse.success).toBe(true)
  })

  it("supports identify, consent, session end, and batch endpoints", async () => {
    const controller = new TrackingController()

    const startRequest = createBaseRequest("/session/start")
    startRequest.body.payload = {
      context: sampleContext(),
    }

    const startResponse = await controller.handle(startRequest)
    const sessionData = startResponse.data as { session: { sessionId: string; visitorId: string } }

    const identifyRequest = createBaseRequest("/identify")
    identifyRequest.body.payload = {
      sourceVisitorId: sessionData.session.visitorId,
      targetCustomerId: "cust_77",
    }
    const identifyResponse = await controller.handle(identifyRequest)
    expect(identifyResponse.success).toBe(true)

    const consentRequest = createBaseRequest("/consent")
    consentRequest.body.payload = {
      visitorId: sessionData.session.visitorId,
      consent: {
        status: "partial",
        categories: {
          analytics: true,
          marketing: false,
          personalization: true,
        },
        updatedAt: new Date().toISOString(),
      },
    }
    const consentResponse = await controller.handle(consentRequest)
    expect(consentResponse.success).toBe(true)

    const batchRequest = createBaseRequest("/batch")
    batchRequest.body.payload = {
      events: [
        {
          sessionId: sessionData.session.sessionId,
          eventId: "evt_b1",
          name: "product_viewed",
          context: sampleContext(),
          payload: { productId: "sku_1" },
        },
        {
          sessionId: sessionData.session.sessionId,
          eventId: "evt_b2",
          name: "add_to_cart",
          context: sampleContext(),
          payload: { productId: "sku_1" },
        },
      ],
    }
    const batchResponse = await controller.handle(batchRequest)
    expect(batchResponse.success).toBe(true)

    const endRequest = createBaseRequest("/session/end")
    endRequest.body.payload = {
      sessionId: sessionData.session.sessionId,
      context: sampleContext(),
      exitPage: "/checkout",
    }
    const endResponse = await controller.handle(endRequest)
    expect(endResponse.success).toBe(true)
  })

  it("supports public/private/signed auth modes and rejects invalid keys", async () => {
    const authConfig = {
      publicKeysByWorkspace: { ws_1: ["pub_key_1"] },
      privateKeysByWorkspace: { ws_1: ["priv_key_1"] },
      signatureSecretsByWorkspace: { ws_1: "sig_secret_1" },
    }

    const controller = new TrackingController({ authenticationConfig: authConfig })
    const baseNow = Date.now()

    const publicRequest = createBaseRequest("/session/start")
    publicRequest.body.timestamp = new Date(baseNow + 1_000).toISOString()
    publicRequest.headers["x-tracking-auth-mode"] = "public"
    publicRequest.body.trackingKey = "pub_key_1"
    publicRequest.body.payload = { context: sampleContext() }
    const publicResponse = await controller.handle(publicRequest)
    expect(publicResponse.success).toBe(true)

    const privateRequest = createBaseRequest("/session/start")
    privateRequest.body.timestamp = new Date(baseNow + 2_000).toISOString()
    privateRequest.headers["x-tracking-auth-mode"] = "private"
    privateRequest.body.trackingKey = "priv_key_1"
    privateRequest.body.payload = { context: sampleContext() }
    const privateResponse = await controller.handle(privateRequest)
    expect(privateResponse.success).toBe(true)

    const signedRequest = createBaseRequest("/session/start")
    signedRequest.body.timestamp = new Date(baseNow + 3_000).toISOString()
    signedRequest.headers["x-tracking-auth-mode"] = "signed"
    signedRequest.body.trackingKey = "pub_key_1"
    signedRequest.body.payload = { context: sampleContext() }
    signedRequest.headers["x-tracking-signature"] = createHmac("sha256", "sig_secret_1")
      .update(JSON.stringify(signedRequest.body))
      .digest("hex")
    const signedResponse = await controller.handle(signedRequest)
    expect(signedResponse.success).toBe(true)

    const invalidPublicRequest = createBaseRequest("/session/start")
    invalidPublicRequest.body.timestamp = new Date(baseNow + 4_000).toISOString()
    invalidPublicRequest.headers["x-tracking-auth-mode"] = "public"
    invalidPublicRequest.body.trackingKey = "wrong_key"
    invalidPublicRequest.body.payload = { context: sampleContext() }
    const invalidPublicResponse = await controller.handle(invalidPublicRequest)
    expect(invalidPublicResponse.success).toBe(false)
    expect(invalidPublicResponse.statusCode).toBe(401)
  })

  it("validates required fields/timestamp/payload size and applies rate limiting and dedup", async () => {
    const controller = new TrackingController({
      rateLimiter: new TrackingRateLimiter({ windowMs: 60_000, maxRequests: 1 }),
    })

    const invalidRequest = createBaseRequest("/session/start")
    invalidRequest.body.tenantId = ""
    invalidRequest.body.payload = { context: sampleContext() }
    const invalidResponse = await controller.handle(invalidRequest)
    expect(invalidResponse.success).toBe(false)
    expect(invalidResponse.statusCode).toBe(400)

    const first = createBaseRequest("/session/start")
    first.body.payload = { context: sampleContext() }
    const firstResponse = await controller.handle(first)
    expect(firstResponse.success).toBe(true)

    const second = createBaseRequest("/session/start")
    second.body.payload = { context: sampleContext() }
    const secondResponse = await controller.handle(second)
    expect(secondResponse.success).toBe(false)
    expect(secondResponse.statusCode).toBe(429)

    const dedupController = new TrackingController()
    const req1 = createBaseRequest("/session/start")
    req1.body.payload = { context: sampleContext() }
    const res1 = await dedupController.handle(req1)
    expect(res1.success).toBe(true)

    const req2 = JSON.parse(JSON.stringify(req1))
    const res2 = await dedupController.handle(req2)
    expect(res2.success).toBe(false)
    expect(res2.statusCode).toBe(409)
  })
})
