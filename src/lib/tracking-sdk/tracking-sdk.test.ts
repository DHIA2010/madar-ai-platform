import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TrackingClient } from "./tracking-client"

function createSuccessResponse(data: unknown = {}) {
  return new Response(
    JSON.stringify({
      success: true,
      statusCode: 200,
      requestId: `req_${Math.random().toString(36).slice(2, 8)}`,
      data,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
}

describe("tracking sdk", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/landing?utm_source=google&utm_medium=cpc")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("supports manual tracking methods through tracking api endpoints", async () => {
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      const [input] = args
      const url = String(input)
      if (url.endsWith("/session/start")) {
        return createSuccessResponse({ session: { sessionId: "session_api_1" } })
      }

      return createSuccessResponse()
    })

    const client = new TrackingClient(
      {
        apiUrl: "https://tracking.example.com",
        tenantId: "tenant_1",
        workspaceId: "ws_1",
        trackingKey: "pub_key_1",
        autoTracking: false,
        storageBackend: "memory",
      },
      { fetchImpl: fetchMock as unknown as typeof fetch }
    )

    await client.track("custom_event", { source: "manual" })
    await client.identify("customer_1")
    await client.consent({
      status: "partial",
      categories: { analytics: true, marketing: false, personalization: true },
      updatedAt: new Date().toISOString(),
    })
    await client.page("/products")
    await client.product({ productId: "sku_1", price: 120 })
    await client.cart({ cartId: "cart_1", quantity: 2 })
    await client.checkout({ checkoutId: "co_1", step: "shipping" })
    await client.purchase({ orderId: "ord_1", value: 120, currency: "SAR" })

    const calledPaths = fetchMock.mock.calls.map((call) => {
      const url = String(call[0])
      return new URL(url).pathname
    })

    expect(calledPaths).toContain("/track")
    expect(calledPaths).toContain("/identify")
    expect(calledPaths).toContain("/consent")
  })

  it("queues failed requests and flushes them on reconnect", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(createSuccessResponse())

    const client = new TrackingClient(
      {
        apiUrl: "https://tracking.example.com",
        tenantId: "tenant_1",
        workspaceId: "ws_1",
        trackingKey: "pub_key_1",
        autoTracking: false,
        storageBackend: "memory",
        retryCount: 1,
      },
      { fetchImpl: fetchMock as unknown as typeof fetch }
    )

    await client.track("network_lost", { reason: "disconnect" })
    expect(client.getQueueSize()).toBe(1)

    await client.flush()
    expect(client.getQueueSize()).toBe(0)
  })

  it("supports automatic session and page tracking with browser context fields", async () => {
    const fetchMock = vi.fn(async (...args: [RequestInfo | URL, RequestInit?]) => {
      const [input] = args
      const url = String(input)
      if (url.endsWith("/session/start")) {
        return createSuccessResponse({ session: { sessionId: "session_api_2" } })
      }

      return createSuccessResponse()
    })

    const client = new TrackingClient(
      {
        apiUrl: "https://tracking.example.com",
        tenantId: "tenant_1",
        workspaceId: "ws_1",
        trackingKey: "pub_key_1",
        autoTracking: true,
        storageBackend: "memory",
      },
      { fetchImpl: fetchMock as unknown as typeof fetch }
    )

    await client.start()

    const calls = fetchMock.mock.calls
    const sessionCall = calls.find((call) => String(call[0]).endsWith("/session/start"))
    const trackCall = calls.find((call) => String(call[0]).endsWith("/track"))

    expect(sessionCall).toBeDefined()
    expect(trackCall).toBeDefined()

    const sessionRequest = (sessionCall as [RequestInfo | URL, RequestInit])[1]
    const body = JSON.parse(String(sessionRequest.body)) as {
      payload: {
        context: {
          language: string
          screenSize: string
          referrer: string | null
          landingPage: string
          utm: {
            source: string | null
            medium: string | null
          }
          device: {
            browser: string
          }
        }
      }
    }

    expect(body.payload.context.language.length).toBeGreaterThan(0)
    expect(body.payload.context.screenSize).toContain("x")
    expect(body.payload.context.landingPage).toContain("/landing")
    expect(body.payload.context.utm.source).toBe("google")
    expect(body.payload.context.utm.medium).toBe("cpc")
    expect(body.payload.context.device.browser.length).toBeGreaterThan(0)

    client.stop()
  })
})
