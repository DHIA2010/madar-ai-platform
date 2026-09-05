// @vitest-environment jsdom
//
// Executes the real served SDK JavaScript (tracking/sdk.ts) in a DOM rather than asserting on its
// source text, which is what the string-matching checks in tracking-sdk.http.test.ts can do at
// best. The bugs this file covers -- a click ID silently dropped, a stale customer id surviving
// logout -- are behavioural: the source contained all the right identifiers while doing the wrong
// thing, so only running it can catch them.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TRACKING_SDK_JS_V1 } from "../tracking/sdk"

const API_ORIGIN = "https://api.madar.test"
const SITE_KEY = "mtk_behaviortest0000000000"

interface CapturedEvent {
  event: string
  clickId: string | null
  clickIdPlatform: string | null
  utmSource: string | null
  utmCampaign: string | null
  customerId: string | null
  customerEmail: string | null
}

let fetchMock: ReturnType<typeof vi.fn>

// The SDK wraps history.pushState/replaceState to catch SPA navigation. That patch would
// otherwise survive into the next test and call into the previous run's window.Madar, so the
// originals are restored before each run.
const originalPushState = window.history.pushState.bind(window.history)
const originalReplaceState = window.history.replaceState.bind(window.history)

// Runs the SDK exactly as the browser would: document.currentScript pointing at the script tag
// the loader injected, carrying the site key and the API origin in its src.
function runSdk(options: { search?: string } = {}) {
  window.history.replaceState({}, "", `/${options.search ?? ""}`)

  const scriptEl = document.createElement("script")
  scriptEl.src = `${API_ORIGIN}/v1/tracking/sdk-v1.0.0.js`
  scriptEl.setAttribute("data-madar-site", SITE_KEY)
  document.head.appendChild(scriptEl)
  Object.defineProperty(document, "currentScript", {
    value: scriptEl,
    configurable: true,
  })

  new Function(TRACKING_SDK_JS_V1)()
}

// The SDK batches and flushes on a 2s interval; advancing past it drains whatever is queued.
function flush() {
  vi.advanceTimersByTime(2100)
}

function capturedEvents(): CapturedEvent[] {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]).endsWith("/v1/tracking/capture"))
    .map((call) => JSON.parse((call[1] as { body: string }).body) as CapturedEvent)
}

beforeEach(() => {
  vi.useFakeTimers()

  window.history.pushState = originalPushState
  window.history.replaceState = originalReplaceState

  fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
  vi.stubGlobal("fetch", fetchMock)

  window.localStorage.clear()
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim()
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`
  }
  delete (window as { customer?: unknown }).customer
  delete (window as { customerAuthState?: unknown }).customerAuthState
  delete (window as { customerAsync?: unknown }).customerAsync
  delete (window as { Madar?: unknown }).Madar
  delete (window as { madarq?: unknown }).madarq
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("attribution capture", () => {
  it("captures an auto-tagged gclid arriving with no utm params at all", () => {
    // The exact shape Google Ads auto-tagging produces. This was silently discarded: capture was
    // gated on utm_source/utm_campaign being present, so the click id never reached the server
    // and the visit looked like direct traffic.
    runSdk({ search: "?gclid=EAIaIQobChMI-test-click-id" })
    flush()

    const [pageView] = capturedEvents()
    expect(pageView.event).toBe("page_view")
    expect(pageView.clickId).toBe("EAIaIQobChMI-test-click-id")
    expect(pageView.clickIdPlatform).toBe("google_ads")
    expect(pageView.utmSource).toBeNull()
  })

  it.each([
    ["fbclid", "meta_ads"],
    ["ttclid", "tiktok_ads"],
    ["ScCid", "snapchat_ads"],
    ["gbraid", "google_ads"],
    ["wbraid", "google_ads"],
  ])("captures a bare %s and attributes it to %s", (param, platform) => {
    runSdk({ search: `?${param}=click-value-123` })
    flush()

    const [pageView] = capturedEvents()
    expect(pageView.clickId).toBe("click-value-123")
    expect(pageView.clickIdPlatform).toBe(platform)
  })

  it("still captures utm params with no click id, unchanged", () => {
    runSdk({ search: "?utm_source=newsletter&utm_campaign=spring" })
    flush()

    const [pageView] = capturedEvents()
    expect(pageView.utmSource).toBe("newsletter")
    expect(pageView.utmCampaign).toBe("spring")
    expect(pageView.clickId).toBeNull()
  })

  it("persists attribution across a later page view that carries no query params", () => {
    runSdk({ search: "?gclid=persisted-click" })
    flush()

    // The SDK's own SPA hook fires the second page view off this navigation.
    window.history.replaceState({}, "", "/products/some-item")
    flush()

    const events = capturedEvents()
    expect(events).toHaveLength(2)
    expect(events[1].clickId).toBe("persisted-click")
    expect(events[1].event).toBe("page_view")
  })
})

describe("customer identity", () => {
  it("identifies from Zid's window.customer global and sends the id on later events", () => {
    ;(window as { customer?: unknown }).customer = {
      id: 55123,
      name: "Test Customer",
      mobile: "+966500000000",
      email: "shopper@example.com",
    }

    runSdk()
    flush()

    const events = capturedEvents()
    const identify = events.find((event) => event.event === "identify")
    expect(identify).toBeDefined()
    expect(identify?.customerId).toBe("55123")
    // Read from window.customer.email; previously only Shopify globals were consulted, so every
    // Zid/Salla storefront reported null here.
    expect(identify?.customerEmail).toBe("shopper@example.com")
    expect(window.localStorage.getItem("madar_customer_id")).toBe("55123")
  })

  it("never sends the customer's name or mobile, only the opaque id", () => {
    ;(window as { customer?: unknown }).customer = {
      id: 55123,
      name: "Test Customer",
      firstname: "Test",
      mobile: "+966500000000",
    }

    runSdk()
    flush()

    const serialized = JSON.stringify(capturedEvents())
    expect(serialized).not.toContain("Test Customer")
    expect(serialized).not.toContain("+966500000000")
  })

  it("does not re-emit identify for the same customer on a second page view", () => {
    ;(window as { customer?: unknown }).customer = { id: 77 }

    runSdk()
    flush()
    ;(window as unknown as { Madar: { identify: (id: string) => void } }).Madar.identify("77")
    flush()

    expect(capturedEvents().filter((event) => event.event === "identify")).toHaveLength(1)
  })

  it("Madar.reset() clears the stored customer id without disturbing the visitor id", () => {
    ;(window as { customer?: unknown }).customer = { id: 900 }
    runSdk()
    flush()

    const madar = (
      window as unknown as {
        Madar: { reset: () => void; page: () => void; getVisitorId: () => string }
      }
    ).Madar
    const visitorIdBefore = madar.getVisitorId()

    madar.reset()
    madar.page()
    flush()

    expect(window.localStorage.getItem("madar_customer_id")).toBeNull()
    expect(madar.getVisitorId()).toBe(visitorIdBefore)

    const events = capturedEvents()
    expect(events[events.length - 1].customerId).toBeNull()
  })

  it("clears a stale stored customer id when the storefront reports an unauthenticated visitor", () => {
    // A previous customer logged in on this browser, then logged out. Without the auth-state
    // check the next visitor keeps reporting the previous customer's id forever.
    window.localStorage.setItem("madar_customer_id", "previous-customer")
    ;(window as { customerAuthState?: unknown }).customerAuthState = {
      isAuthenticated: false,
      isGuest: true,
    }

    runSdk()
    flush()

    expect(window.localStorage.getItem("madar_customer_id")).toBeNull()
    for (const event of capturedEvents()) {
      expect(event.customerId).toBeNull()
    }
  })

  it("leaves identity untouched on a storefront exposing none of these globals", () => {
    window.localStorage.setItem("madar_customer_id", "kept-customer")

    runSdk()
    flush()

    expect(window.localStorage.getItem("madar_customer_id")).toBe("kept-customer")
    expect(capturedEvents()[0].customerId).toBe("kept-customer")
  })
})

describe("command queue", () => {
  it("replays events queued before the SDK finished loading, in order", () => {
    // A storefront event snippet firing while the async SDK is still in flight.
    ;(window as unknown as { madarq: unknown[] }).madarq = [
      ["track", "product_view", { product_id: "p-1" }],
      ["track", "add_to_cart", { product_id: "p-1", quantity: 2 }],
    ]

    runSdk()
    flush()

    const events = capturedEvents().map((event) => event.event)
    expect(events).toContain("product_view")
    expect(events).toContain("add_to_cart")
    expect(events.indexOf("product_view")).toBeLessThan(events.indexOf("add_to_cart"))
  })

  it("keeps working for pushes made after the SDK has loaded", () => {
    runSdk()
    flush()

    // The identical two lines a snippet uses either side of load.
    const win = window as unknown as { madarq: { push: (entry: unknown[]) => void } }
    win.madarq = win.madarq || ([] as never)
    win.madarq.push(["track", "purchase", { order_id: "9001" }])
    flush()

    expect(capturedEvents().some((event) => event.event === "purchase")).toBe(true)
  })

  it("carries queued event properties through to the payload", () => {
    ;(window as unknown as { madarq: unknown[] }).madarq = [
      ["track", "purchase", { order_id: "A-1", revenue: 250, currency: "SAR" }],
    ]

    runSdk()
    flush()

    const purchase = fetchMock.mock.calls
      .filter((call) => String(call[0]).endsWith("/v1/tracking/capture"))
      .map((call) => JSON.parse((call[1] as { body: string }).body))
      .find((payload) => payload.event === "purchase")
    expect(purchase.properties).toMatchObject({ order_id: "A-1", revenue: 250, currency: "SAR" })
  })

  it("ignores queued entries naming anything outside the public surface", () => {
    ;(window as unknown as { madarq: unknown[] }).madarq = [
      ["constructor"],
      ["toString"],
      ["nope", "whatever"],
      [],
      null,
    ]

    expect(() => {
      runSdk()
      flush()
    }).not.toThrow()

    // Only the SDK's own opening page view -- nothing the malformed entries produced.
    expect(capturedEvents().map((event) => event.event)).toEqual(["page_view"])
  })
})

describe("fail-open behaviour", () => {
  it("never throws when the capture endpoint rejects", () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("network down")))

    expect(() => {
      runSdk({ search: "?gclid=abc" })
      flush()
    }).not.toThrow()
  })
})
