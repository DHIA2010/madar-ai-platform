// @vitest-environment node

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
      fullName: "Capture Test Owner",
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
     values ($1, $2, 'hash', 'Capture Test Owner', now()) on conflict (id) do nothing`,
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

describe("tracking snippet + capture", () => {
  it("serves the snippet as public, cacheable JavaScript", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/snippet.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/javascript")
    const body = await response.text()
    expect(body).toContain("data-madar-site")
    expect(body).toContain("/v1/tracking/capture")
  })

  it("lazily mints and then reuses a stable site key for an organization", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@capture-key.madar",
      "Capture Key Org"
    )

    const first = await fetch(`${baseUrl}/v1/tracking/site-key`, {
      headers: authHeaders(accessToken),
    })
    expect(first.status).toBe(200)
    const firstBody = (await first.json()) as { siteKey: string }
    expect(firstBody.siteKey).toMatch(/^mtk_[0-9a-f]{24}$/)

    const second = await fetch(`${baseUrl}/v1/tracking/site-key`, {
      headers: authHeaders(accessToken),
    })
    const secondBody = (await second.json()) as { siteKey: string }
    expect(secondBody.siteKey).toBe(firstBody.siteKey)
  })

  it("rejects an unauthenticated site-key request", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/site-key`)
    expect(response.status).toBe(401)
  })

  it("accepts a preflight from an arbitrary merchant origin with a wildcard CORS header", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "OPTIONS",
      headers: { origin: "https://some-merchant-storefront.example" },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("*")
  })

  it("captures a page view against a valid site key and it lands in tracking_events/attributions", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@capture-page.madar",
      "Capture Page Org"
    )
    const siteKeyResponse = await fetch(`${baseUrl}/v1/tracking/site-key`, {
      headers: authHeaders(accessToken),
    })
    const { siteKey } = (await siteKeyResponse.json()) as { siteKey: string }

    const captureResponse = await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteKey,
        visitorId: "visitor-abc",
        sessionId: "session-abc",
        pageUrl: "https://merchant-store.example/landing?utm_source=tiktok&utm_medium=organic",
        utmSource: "tiktok",
        utmMedium: "organic",
        customerEmail: "Shopper@Example.com",
      }),
    })
    expect(captureResponse.status).toBe(200)
    expect(await captureResponse.json()).toEqual({ ok: true })

    const events = await database.query(
      `SELECT event_type, campaign_link_id, utm_source, utm_medium, landing_url
       FROM tracking_events WHERE organization_id = $1`,
      [organizationId]
    )
    expect(events.rows[0]).toMatchObject({
      event_type: "PAGE_VIEW",
      campaign_link_id: null,
      utm_source: "tiktok",
      utm_medium: "organic",
      landing_url: "https://merchant-store.example/landing?utm_source=tiktok&utm_medium=organic",
    })

    const attributions = await database.query(
      `SELECT campaign_id, campaign_link_id, customer_ref FROM attributions WHERE organization_id = $1`,
      [organizationId]
    )
    // Never the raw email -- always the sha256 hash of the trimmed, lowercased address.
    expect(attributions.rows[0].customer_ref).toMatch(/^[0-9a-f]{64}$/)
    expect(attributions.rows[0].customer_ref).not.toContain("shopper")
    expect(attributions.rows[0]).toMatchObject({ campaign_id: null, campaign_link_id: null })
  })

  it("returns 404 for an unknown site key", async () => {
    const response = await fetch(`${baseUrl}/v1/tracking/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteKey: "mtk_doesnotexist00000000",
        visitorId: "v",
        sessionId: "s",
        pageUrl: "https://merchant-store.example/",
      }),
    })
    expect(response.status).toBe(404)
  })
})
