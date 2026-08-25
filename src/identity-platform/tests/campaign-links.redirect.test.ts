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
      fullName: "Redirect Test Owner",
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
     values ($1, $2, 'hash', 'Redirect Test Owner', now()) on conflict (id) do nothing`,
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

  return { accessToken: login.session.accessToken }
}

function authHeaders(accessToken: string) {
  return { "content-type": "application/json", authorization: `Bearer ${accessToken}` }
}

async function createShortLink(accessToken: string) {
  const campaignResponse = await fetch(`${baseUrl}/v1/campaigns`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ displayName: "Redirect Campaign" }),
  })
  const campaign = (await campaignResponse.json()) as { id: string }

  const linkResponse = await fetch(`${baseUrl}/v1/campaign-links`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      campaignId: campaign.id,
      name: "Redirect Link",
      trackingType: "SHORT_LINK",
      destinationBaseUrl: "https://shop.example.com/redirect-target",
      utmSource: "tiktok",
      utmMedium: "paid",
      utmCampaign: "redirect-test",
    }),
  })
  return (await linkResponse.json()) as { id: string; displayId: string; finalUrl: string }
}

describe("campaign link redirect", () => {
  it("redirects, mints tracking cookies, and records a click/attribution row", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@redirect-test.madar",
      "Redirect Test Org"
    )
    const link = await createShortLink(accessToken)

    const response = await fetch(`${baseUrl}/m/${link.displayId}`, { redirect: "manual" })
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(link.finalUrl)
    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toMatch(/madar_visitor_id=/)
    expect(setCookie).toMatch(/madar_session_id=/)

    // Click/attribution recording happens after the response is sent -- give the event loop a
    // tick to let the fire-and-forget write land before asserting on it.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const events = await database.query(
      `SELECT * FROM tracking_events WHERE campaign_link_id = $1`,
      [link.id]
    )
    expect(events.rows).toHaveLength(1)
    expect((events.rows[0] as { event_type: string }).event_type).toBe("CLICK")

    const attributions = await database.query(
      `SELECT * FROM attributions WHERE campaign_link_id = $1`,
      [link.id]
    )
    expect(attributions.rows).toHaveLength(1)
  })

  it("captures a resolved click id and platform entity macros from the incoming click's query string", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@redirect-macro.madar",
      "Redirect Macro Org"
    )
    const link = await createShortLink(accessToken)

    const response = await fetch(
      `${baseUrl}/m/${link.displayId}?gclid=real-gclid-123&madar_ad_campaign_id=999&madar_ad_adgroup_id=888&madar_ad_keyword=running+shoes&madar_ad_creative_id=777`,
      { redirect: "manual" }
    )
    expect(response.status).toBe(302)
    // The redirect target is unaffected by the incoming click's query string -- it always goes
    // to the stored finalUrl.
    expect(response.headers.get("location")).toBe(link.finalUrl)

    await new Promise((resolve) => setTimeout(resolve, 50))

    const events = await database.query(
      `SELECT click_id, click_id_platform, platform_campaign_id, platform_adgroup_id,
              platform_keyword, platform_creative_id
       FROM tracking_events WHERE campaign_link_id = $1`,
      [link.id]
    )
    expect(events.rows[0]).toMatchObject({
      click_id: "real-gclid-123",
      click_id_platform: "google_ads",
      platform_campaign_id: "999",
      platform_adgroup_id: "888",
      platform_keyword: "running shoes",
      platform_creative_id: "777",
    })

    const attributions = await database.query(
      `SELECT click_id, click_id_platform, platform_campaign_id
       FROM attributions WHERE campaign_link_id = $1`,
      [link.id]
    )
    expect(attributions.rows[0]).toMatchObject({
      click_id: "real-gclid-123",
      click_id_platform: "google_ads",
      platform_campaign_id: "999",
    })
  })

  it("returns 404 for an unknown display id", async () => {
    const response = await fetch(`${baseUrl}/m/MD-2026-99999`, { redirect: "manual" })
    expect(response.status).toBe(404)
  })

  it("returns 410 once the link is disabled, and the redirect resumes after re-enabling", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@redirect-disable.madar",
      "Redirect Disable Org"
    )
    const link = await createShortLink(accessToken)

    await fetch(`${baseUrl}/v1/campaign-links/${link.id}/disable`, {
      method: "POST",
      headers: authHeaders(accessToken),
    })

    const disabledResponse = await fetch(`${baseUrl}/m/${link.displayId}`, { redirect: "manual" })
    expect(disabledResponse.status).toBe(410)

    await fetch(`${baseUrl}/v1/campaign-links/${link.id}/enable`, {
      method: "POST",
      headers: authHeaders(accessToken),
    })

    const enabledResponse = await fetch(`${baseUrl}/m/${link.displayId}`, { redirect: "manual" })
    expect(enabledResponse.status).toBe(302)
  })

  it("reuses an existing visitor/session cookie instead of minting new ones", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@redirect-cookies.madar",
      "Redirect Cookies Org"
    )
    const link = await createShortLink(accessToken)

    const response = await fetch(`${baseUrl}/m/${link.displayId}`, {
      redirect: "manual",
      headers: { cookie: "madar_visitor_id=known-visitor; madar_session_id=known-session" },
    })
    expect(response.status).toBe(302)
    expect(response.headers.get("set-cookie")).toBeNull()
  })
})
