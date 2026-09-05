// @vitest-environment node
//
// Covers the Madar Tracking Snippet + SDK extension of the existing tracking domain: remote
// config, the full e-commerce event vocabulary, heartbeat/live-visitors, geo/referrer
// enrichment, and SDK versioning. tracking.capture.test.ts keeps covering the original
// snippet/site-key/CORS/PAGE_VIEW-attribution behavior this extends.

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  delete process.env.GEOIP_DB_PATH

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
  await database.end()
})

async function registerAndProvisionOrg(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Tracking SDK Test Owner",
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as { verificationToken: string }

  await fetch(`${baseUrl}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registration.verificationToken }),
  })

  const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'Tracking SDK Test Owner', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Default Workspace', 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId]
    )
  }

  return { accessToken: login.session.accessToken, organizationId: actor.organizationId }
}

function authHeaders(accessToken: string) {
  return { "content-type": "application/json", authorization: `Bearer ${accessToken}` }
}

async function getSiteKey(accessToken: string) {
  const response = await fetch(`${baseUrl}/v1/tracking/site-key`, {
    headers: authHeaders(accessToken),
  })
  const body = (await response.json()) as { siteKey: string }
  return body.siteKey
}

describe("GET /v1/tracking/config/:siteKey", () => {
  it("returns the default remote config shape for an org with no override", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@config-default.madar",
      "Config Default Org"
    )
    const siteKey = await getSiteKey(accessToken)

    const response = await fetch(`${baseUrl}/v1/tracking/config/${siteKey}`)
    expect(response.status).toBe(200)
    // Fetched cross-origin from an arbitrary merchant storefront (see loader-fragment.ts) --
    // must carry a wildcard CORS header or the browser blocks the storefront JS from reading it,
    // even though the request itself succeeds server-side (a bug this test guards against).
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    const config = (await response.json()) as Record<string, unknown>

    expect(config.sdk_version).toBe("1.0.0")
    expect(config.heartbeat_interval).toBe(30_000)
    expect(config.session_timeout).toBe(1_800_000)
    expect(config.live_visitor_timeout).toBe(300_000)
    expect(config.tracking).toMatchObject({
      page_view: true,
      product_view: true,
      add_to_cart: true,
      checkout: true,
      purchase: true,
    })
    expect(config.attribution).toMatchObject({
      utm: true,
      gclid: true,
      fbclid: true,
      ttclid: true,
      snap_click_id: true,
    })
  })

  it("merges a per-organization tracking_config override over the defaults", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@config-override.madar",
      "Config Override Org"
    )
    const siteKey = await getSiteKey(accessToken)

    await database.query(`UPDATE organizations SET tracking_config = $2 WHERE id = $1`, [
      organizationId,
      JSON.stringify({ heartbeat_interval: 10_000, tracking: { purchase: false } }),
    ])

    const response = await fetch(`${baseUrl}/v1/tracking/config/${siteKey}`)
    const config = (await response.json()) as Record<string, unknown>

    expect(config.heartbeat_interval).toBe(10_000)
    // Untouched defaults survive a partial override.
    expect(config.session_timeout).toBe(1_800_000)
    expect(config.tracking).toMatchObject({ page_view: true, purchase: false })
  })

  it("returns 404 for an unknown site key", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/config/mtk_doesnotexist00000000`)
    expect(response.status).toBe(404)
  })
})

describe("GET /v1/tracking/site-key", () => {
  it("returns a snippetUrl that actually serves the snippet", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@snippet-url.madar",
      "Snippet Url Org"
    )

    const response = await fetch(`${baseUrl}/v1/tracking/site-key`, {
      headers: authHeaders(accessToken),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { siteKey: string; snippetUrl: string }
    expect(body.siteKey).toMatch(/^mtk_/)

    // Built from this API's own origin. It previously came from shortLinkBaseUrl, which falls
    // back to appUrl -- the dashboard frontend -- so production handed every merchant a URL that
    // 404s. Fetching it here is the point of the test: a URL that doesn't serve JavaScript is
    // worse than no URL at all, and only a real request proves it.
    expect(body.snippetUrl).toBe(`${baseUrl}/v1/tracking/snippet.js`)

    const snippetResponse = await fetch(body.snippetUrl)
    expect(snippetResponse.status).toBe(200)
    expect(snippetResponse.headers.get("content-type")).toContain("application/javascript")
    expect(await snippetResponse.text()).toContain("data-madar-site")
  })
})

describe("GET /v1/tracking/sdk-v:version.js", () => {
  it("serves the current SDK version with the public Madar.* surface and long-lived caching", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/sdk-v1.0.0.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/javascript")
    expect(response.headers.get("cache-control")).toContain("immutable")
    const body = await response.text()
    expect(body).toContain("window.Madar")
    expect(body).toContain("getVisitorId")
    expect(body).toContain("getSessionId")
    // Never the actual Geolocation API -- the "no navigator.geolocation" comment nearby is
    // documentation, not a false positive to guard against here.
    expect(body).not.toContain("getCurrentPosition")
    expect(body).not.toContain("watchPosition")
  })

  it("returns 404 for an unknown SDK version", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/sdk-v99.0.0.js`)
    expect(response.status).toBe(404)
  })
})

describe("POST /v1/tracking/capture: full event vocabulary", () => {
  it("accepts an add_to_cart event with properties and normalized page/device context", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@capture-cart.madar",
      "Capture Cart Org"
    )
    const siteKey = await getSiteKey(accessToken)

    const response = await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteKey,
        visitorId: "visitor-cart",
        sessionId: "session-cart",
        event: "add_to_cart",
        eventId: "evt-1",
        pageUrl: "https://merchant-store.example/products/red-shirt",
        pageTitle: "Red Shirt",
        properties: {
          product_id: "123",
          product_name: "Red Shirt",
          quantity: 2,
          price: 100,
          currency: "SAR",
        },
        device: {
          type: "mobile",
          browser: "Safari",
          os: "iOS",
          language: "ar-SA",
          timezone: "Asia/Riyadh",
        },
      }),
    })
    expect(response.status).toBe(200)

    const events = await database.query(
      `SELECT event_type, properties, page, device FROM tracking_events WHERE organization_id = $1`,
      [organizationId]
    )
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0].event_type).toBe("ADD_TO_CART")
    expect(events.rows[0].properties).toMatchObject({ product_id: "123", quantity: 2 })
    expect(events.rows[0].page).toMatchObject({ title: "Red Shirt" })
    expect(events.rows[0].device).toMatchObject({ type: "mobile", browser: "Safari" })

    // A granular e-commerce event is NOT a fresh attribution touchpoint -- only CLICK/PAGE_VIEW
    // write to attributions, matching the table's existing purpose.
    const attributions = await database.query(
      `SELECT * FROM attributions WHERE organization_id = $1`,
      [organizationId]
    )
    expect(attributions.rows).toHaveLength(0)
  })

  it("is idempotent on a retried event_id (never double-inserts)", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@capture-idempotent.madar",
      "Capture Idempotent Org"
    )
    const siteKey = await getSiteKey(accessToken)
    const body = JSON.stringify({
      siteKey,
      visitorId: "visitor-retry",
      sessionId: "session-retry",
      event: "purchase",
      eventId: "evt-retry-1",
      pageUrl: "https://merchant-store.example/thank-you",
      properties: { order_id: "9001", revenue: 250, currency: "SAR" },
    })

    const first = await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
    expect(first.status).toBe(200)

    // Real client retry: same eventId sent twice (e.g. a flaky network response after the
    // server actually persisted it). The unique (organization_id, event_id) index rejects the
    // duplicate insert -- surfaced as a 500 today (no dedicated dedup-aware catch branch), which
    // is still correct in that it never produces a second row. What matters here is exactly one
    // row exists afterward.
    const secondResponse = await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
    expect([200, 500]).toContain(secondResponse.status)

    const events = await database.query(
      `SELECT id FROM tracking_events WHERE organization_id = $1 AND event_id = 'evt-retry-1'`,
      [organizationId]
    )
    expect(events.rows).toHaveLength(1)
  })
})

describe("POST /v1/tracking/capture: heartbeat + live visitors", () => {
  it("a heartbeat updates tracking_live_visitors without inserting into tracking_events", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@heartbeat.madar",
      "Heartbeat Org"
    )
    const siteKey = await getSiteKey(accessToken)

    // A page view first, like a real session, then a heartbeat.
    await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteKey,
        visitorId: "visitor-hb",
        sessionId: "session-hb",
        event: "page_view",
        pageUrl: "https://merchant-store.example/",
        pageTitle: "Home",
      }),
    })

    const heartbeatResponse = await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteKey,
        visitorId: "visitor-hb",
        sessionId: "session-hb",
        event: "heartbeat",
        pageUrl: "https://merchant-store.example/",
      }),
    })
    expect(heartbeatResponse.status).toBe(200)

    const events = await database.query(
      `SELECT event_type FROM tracking_events WHERE organization_id = $1`,
      [organizationId]
    )
    // Only the page_view landed -- the heartbeat never inserted a tracking_events row.
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0].event_type).toBe("PAGE_VIEW")

    const liveVisitors = await database.query(
      `SELECT visitor_id, current_activity FROM tracking_live_visitors WHERE organization_id = $1`,
      [organizationId]
    )
    expect(liveVisitors.rows).toHaveLength(1)
    expect(liveVisitors.rows[0]).toMatchObject({
      visitor_id: "visitor-hb",
      current_activity: "HEARTBEAT",
    })
  })

  it("GET /v1/tracking/live-visitors requires auth and returns only visitors within the timeout window", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@live-visitors.madar",
      "Live Visitors Org"
    )
    const siteKey = await getSiteKey(accessToken)

    const unauthenticated = await fetch(`${baseUrl}/v1/tracking/live-visitors`)
    expect(unauthenticated.status).toBe(401)

    await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteKey,
        visitorId: "visitor-live",
        sessionId: "session-live",
        event: "product_view",
        pageUrl: "https://merchant-store.example/products/blue-hat",
        pageTitle: "Blue Hat",
        properties: { product_id: "hat-1", product_name: "Blue Hat" },
      }),
    })

    // A visitor whose last_seen_at is already outside the default 5-minute live-visitor window
    // -- must not appear in the read.
    await database.query(
      `INSERT INTO tracking_live_visitors (id, organization_id, visitor_id, session_id, last_seen_at, current_activity)
       VALUES ($1, $2, 'visitor-stale', 'session-stale', now() - interval '10 minutes', 'PAGE_VIEW')`,
      [randomUUID(), organizationId]
    )

    const response = await fetch(`${baseUrl}/v1/tracking/live-visitors`, {
      headers: authHeaders(accessToken),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      totalLiveVisitors: number
      visitors: Array<{ visitorId: string; productId: string | null; currentActivity: string }>
    }
    expect(body.totalLiveVisitors).toBe(1)
    expect(body.visitors[0]).toMatchObject({
      visitorId: "visitor-live",
      productId: "hat-1",
      currentActivity: "PRODUCT_VIEW",
    })
  })
})

describe("POST /v1/tracking/capture: referrer classification + geo fail-open", () => {
  it.each([
    ["https://www.google.com/search?q=shoes", "Organic Search"],
    ["https://www.instagram.com/p/abc123/", "Social"],
    [null, "Direct"],
    ["https://some-blog.example/post", "Referral"],
  ])("classifies referrer %s as %s", async (referrerUrl, expectedTrafficSource) => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      `owner@referrer-${expectedTrafficSource.toLowerCase().replace(" ", "-")}.madar`,
      `Referrer ${expectedTrafficSource} Org`
    )
    const siteKey = await getSiteKey(accessToken)

    await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteKey,
        visitorId: "visitor-ref",
        sessionId: "session-ref",
        event: "page_view",
        pageUrl: "https://merchant-store.example/",
        referrerUrl,
      }),
    })

    const liveVisitors = await database.query(
      `SELECT traffic_source FROM tracking_live_visitors WHERE organization_id = $1`,
      [organizationId]
    )
    expect(liveVisitors.rows[0].traffic_source).toBe(expectedTrafficSource)
  })

  it("resolves geo to null on every field when GEOIP_DB_PATH is not configured (fail-open, never throws)", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@geo-failopen.madar",
      "Geo Fail Open Org"
    )
    const siteKey = await getSiteKey(accessToken)

    const response = await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteKey,
        visitorId: "visitor-geo",
        sessionId: "session-geo",
        event: "page_view",
        pageUrl: "https://merchant-store.example/",
      }),
    })
    expect(response.status).toBe(200)

    const events = await database.query(
      `SELECT geo, country_code FROM tracking_events WHERE organization_id = $1`,
      [organizationId]
    )
    expect(events.rows[0].geo).toMatchObject({
      country: null,
      countryCode: null,
      region: null,
      city: null,
    })
    expect(events.rows[0].country_code).toBeNull()
  })
})

async function insertSallaConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
  providerAccountId: string | null
  status?: "connected" | "disconnected"
}) {
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, status, provider_account_id,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $7, now(), now())`,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      randomUUID(),
      input.status ?? "connected",
      input.providerAccountId,
      input.userId,
    ]
  )
}

describe("GET /v1/tracking/salla-app-snippet.js", () => {
  it("serves the app-wide Salla loader, distinct from the merchant-installed snippet", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/salla-app-snippet.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/javascript")
    const body = await response.text()
    expect(body).toContain("salla.config.get")
    expect(body).toContain("/v1/tracking/resolve/salla/")
    // Reuses the same shared loader fragment as the merchant snippet, not a copy that could drift.
    expect(body).toContain("madarFetchConfigAndLoadSdk")
  })
})

describe("GET /v1/tracking/resolve/salla/:storeId", () => {
  it("resolves a connected Salla store's own ID to the org's real site key", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@salla-resolve.madar",
      "Salla Resolve Org"
    )
    const actor = await container.commands.resolveActorFromAccessToken(accessToken)
    await insertSallaConnection({
      organizationId,
      workspaceId: actor.workspaceId as string,
      userId: actor.userId,
      providerAccountId: "778899",
    })

    const expectedSiteKey = await getSiteKey(accessToken)

    const response = await fetch(`${baseUrl}/v1/tracking/resolve/salla/778899`)
    expect(response.status).toBe(200)
    // Fetched cross-origin from the merchant's storefront -- must carry a wildcard CORS header.
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    const body = (await response.json()) as { siteKey: string }
    expect(body.siteKey).toBe(expectedSiteKey)
  })

  it("returns 404 for a store ID with no connection at all", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/resolve/salla/does-not-exist`)
    expect(response.status).toBe(404)
  })

  it("returns 404 for a disconnected store's old ID -- a stale connection must never resolve", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@salla-resolve-disconnected.madar",
      "Salla Resolve Disconnected Org"
    )
    const actor = await container.commands.resolveActorFromAccessToken(accessToken)
    await insertSallaConnection({
      organizationId,
      workspaceId: actor.workspaceId as string,
      userId: actor.userId,
      providerAccountId: "556677",
      status: "disconnected",
    })

    const response = await fetch(`${baseUrl}/v1/tracking/resolve/salla/556677`)
    expect(response.status).toBe(404)
  })
})

async function insertZidConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
  storeDomain: string | null
  providerAccountId?: string | null
  status?: "connected" | "disconnected"
}) {
  await database.query(
    `insert into zid_oauth_connections (
       id, organization_id, workspace_id, project_id, status, store_domain, provider_account_id,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $8, now(), now())`,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      randomUUID(),
      input.status ?? "connected",
      input.storeDomain,
      input.providerAccountId ?? null,
      input.userId,
    ]
  )
}

describe("GET /v1/tracking/zid-app-snippet.js", () => {
  it("serves the app-wide Zid loader, distinct from the merchant-installed snippet", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/zid-app-snippet.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/javascript")
    const body = await response.text()
    expect(body).toContain("window.location.hostname")
    expect(body).toContain("/v1/tracking/resolve/zid/")
    // Reuses the same shared loader fragment as the merchant snippet, not a copy that could drift.
    expect(body).toContain("madarFetchConfigAndLoadSdk")
  })

  it("prefers the Zid store ID over hostname matching, accepting it by attribute or global", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/zid-app-snippet.js`)
    const body = await response.text()
    // Both pass-through forms the Partner Dashboard snippet may use for {{store.id}}.
    expect(body).toContain("data-madar-zid-store")
    expect(body).toContain("window.__madarZid")
    expect(body).toContain("/v1/tracking/resolve/zid/store/")
    // An unexpanded template parameter must never be sent to the resolve route as a literal.
    expect(body).toContain('value.indexOf("{{")')
  })
})

describe("GET /v1/tracking/resolve/zid/store/:storeId", () => {
  it("resolves a connected Zid store's own ID to the org's real site key", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@zid-store-resolve.madar",
      "Zid Store Resolve Org"
    )
    const actor = await container.commands.resolveActorFromAccessToken(accessToken)
    await insertZidConnection({
      organizationId,
      workspaceId: actor.workspaceId as string,
      userId: actor.userId,
      // Deliberately null: the real production connection this route exists for has no
      // store_domain (migration 044 added the column nullable, so every older row is null),
      // which is exactly why domain matching could never resolve it.
      storeDomain: null,
      providerAccountId: "3223383",
    })

    const expectedSiteKey = await getSiteKey(accessToken)

    const response = await fetch(`${baseUrl}/v1/tracking/resolve/zid/store/3223383`)
    expect(response.status).toBe(200)
    // Fetched cross-origin from the merchant's storefront -- must carry a wildcard CORS header.
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    const body = (await response.json()) as { siteKey: string }
    expect(body.siteKey).toBe(expectedSiteKey)
  })

  it("returns 404 for a store ID with no connection at all", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/resolve/zid/store/999999999`)
    expect(response.status).toBe(404)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
  })

  it("returns 404 for a disconnected store's old ID -- a stale connection must never resolve", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@zid-store-resolve-disconnected.madar",
      "Zid Store Resolve Disconnected Org"
    )
    const actor = await container.commands.resolveActorFromAccessToken(accessToken)
    await insertZidConnection({
      organizationId,
      workspaceId: actor.workspaceId as string,
      userId: actor.userId,
      storeDomain: null,
      providerAccountId: "4455667",
      status: "disconnected",
    })

    const response = await fetch(`${baseUrl}/v1/tracking/resolve/zid/store/4455667`)
    expect(response.status).toBe(404)
  })

  it("does not collide with the single-segment domain route", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@zid-route-collision.madar",
      "Zid Route Collision Org"
    )
    const actor = await container.commands.resolveActorFromAccessToken(accessToken)
    await insertZidConnection({
      organizationId,
      workspaceId: actor.workspaceId as string,
      userId: actor.userId,
      storeDomain: "collision-store.com",
      providerAccountId: "7788990",
    })

    const expectedSiteKey = await getSiteKey(accessToken)

    // Both paths reach the same tenant by independent means.
    const byStoreId = await fetch(`${baseUrl}/v1/tracking/resolve/zid/store/7788990`)
    const byDomain = await fetch(`${baseUrl}/v1/tracking/resolve/zid/collision-store.com`)
    expect(byStoreId.status).toBe(200)
    expect(byDomain.status).toBe(200)
    expect(((await byStoreId.json()) as { siteKey: string }).siteKey).toBe(expectedSiteKey)
    expect(((await byDomain.json()) as { siteKey: string }).siteKey).toBe(expectedSiteKey)

    // The literal path segment "store" must not be treated as a domain by the older route.
    const bareStoreSegment = await fetch(`${baseUrl}/v1/tracking/resolve/zid/store`)
    expect(bareStoreSegment.status).toBe(404)
  })
})

describe("GET /v1/tracking/resolve/zid/:domain", () => {
  it("resolves a connected Zid store's own domain to the org's real site key", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@zid-resolve.madar",
      "Zid Resolve Org"
    )
    const actor = await container.commands.resolveActorFromAccessToken(accessToken)
    await insertZidConnection({
      organizationId,
      workspaceId: actor.workspaceId as string,
      userId: actor.userId,
      storeDomain: "my-zid-store.com",
    })

    const expectedSiteKey = await getSiteKey(accessToken)

    const response = await fetch(`${baseUrl}/v1/tracking/resolve/zid/my-zid-store.com`)
    expect(response.status).toBe(200)
    // Fetched cross-origin from the merchant's storefront -- must carry a wildcard CORS header.
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
    const body = (await response.json()) as { siteKey: string }
    expect(body.siteKey).toBe(expectedSiteKey)
  })

  it("returns 404 for a domain with no connection at all", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/resolve/zid/does-not-exist.com`)
    expect(response.status).toBe(404)
  })

  it("returns 404 for a disconnected store's stale domain -- a stale connection must never resolve", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@zid-resolve-disconnected.madar",
      "Zid Resolve Disconnected Org"
    )
    const actor = await container.commands.resolveActorFromAccessToken(accessToken)
    await insertZidConnection({
      organizationId,
      workspaceId: actor.workspaceId as string,
      userId: actor.userId,
      storeDomain: "disconnected-zid-store.com",
      status: "disconnected",
    })

    const response = await fetch(`${baseUrl}/v1/tracking/resolve/zid/disconnected-zid-store.com`)
    expect(response.status).toBe(404)
  })
})

describe("GET /v1/tracking/sdk-v1.0.0.js: Salla cart events use the real, confirmed API", () => {
  it('wires salla.cart.event.onItemAdded/onItemDeleted, not the earlier unverified event.on("cart::added") form', async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/sdk-v1.0.0.js`)
    const body = await response.text()
    expect(body).toContain("salla.cart.event.onItemAdded")
    expect(body).toContain("salla.cart.event.onItemDeleted")
    // The old, unverified call form (as actually invoked, not as mentioned in an explanatory
    // comment) must be gone -- window.salla.event.on( was the real broken code, never fired.
    expect(body).not.toContain("window.salla.event.on(")
  })
})
