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
      fullName: "Campaign Links Test Owner",
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
     values ($1, $2, 'hash', 'Campaign Links Test Owner', now()) on conflict (id) do nothing`,
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

async function createCampaign(baseUrlValue: string, accessToken: string, displayName: string) {
  const response = await fetch(`${baseUrlValue}/v1/campaigns`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ displayName }),
  })
  return (await response.json()) as { id: string }
}

describe("campaign links", () => {
  it("creates a SHORT_LINK campaign link with a MADAR display id and normalized UTM values", async () => {
    const { accessToken } = await registerAndProvisionOrg("owner@link-test.madar", "Link Test Org")
    const campaign = await createCampaign(baseUrl, accessToken, "Ramadan Push")

    const createResponse = await fetch(`${baseUrl}/v1/campaign-links`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        campaignId: campaign.id,
        name: "TikTok Story Ad",
        trackingType: "SHORT_LINK",
        destinationBaseUrl: "https://shop.example.com/ramadan",
        utmSource: "TikTok",
        utmMedium: "Paid Social",
        utmCampaign: "Ramadan Push 2026",
      }),
    })
    expect(createResponse.status).toBe(201)
    const link = (await createResponse.json()) as {
      id: string
      displayId: string
      shortUrl: string | null
      finalUrl: string
      utmSource: string
      utmMedium: string
      utmCampaign: string
    }

    expect(link.displayId).toMatch(/^MD-\d{4}-\d{5}$/)
    expect(link.shortUrl).toBe(`https://localhost:3000/m/${link.displayId}`)
    expect(link.utmSource).toBe("tiktok")
    expect(link.utmMedium).toBe("paid-social")
    expect(link.utmCampaign).toBe("ramadan-push-2026")
    expect(link.finalUrl).toBe(
      "https://shop.example.com/ramadan?utm_source=tiktok&utm_medium=paid-social&utm_campaign=ramadan-push-2026"
    )

    const getResponse = await fetch(`${baseUrl}/v1/campaign-links/${link.id}`, {
      headers: authHeaders(accessToken),
    })
    expect(getResponse.status).toBe(200)
  })

  it("does not persist anything from a preview call", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@link-preview.madar",
      "Link Preview Org"
    )
    const campaign = await createCampaign(baseUrl, accessToken, "Preview Campaign")

    const previewResponse = await fetch(`${baseUrl}/v1/campaign-links/preview`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        campaignId: campaign.id,
        name: "Preview Only",
        trackingType: "FULL_URL",
        destinationBaseUrl: "https://shop.example.com/preview",
        utmSource: "Meta",
        utmMedium: "cpc",
        utmCampaign: "Preview Campaign",
      }),
    })
    expect(previewResponse.status).toBe(200)
    const preview = (await previewResponse.json()) as { finalUrl: string; shortUrl: string | null }
    expect(preview.shortUrl).toBeNull()
    expect(preview.finalUrl).toBe(
      "https://shop.example.com/preview?utm_source=meta&utm_medium=cpc&utm_campaign=preview-campaign"
    )

    const listResponse = await fetch(`${baseUrl}/v1/campaign-links`, {
      headers: authHeaders(accessToken),
    })
    const list = (await listResponse.json()) as { items: unknown[] }
    expect(list.items).toHaveLength(0)
  })

  it("cannot change UTM fields, tracking type, or campaign via update -- only name/ad fields/custom params", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@link-immutable.madar",
      "Link Immutable Org"
    )
    const campaign = await createCampaign(baseUrl, accessToken, "Immutable Campaign")

    const createResponse = await fetch(`${baseUrl}/v1/campaign-links`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        campaignId: campaign.id,
        name: "Original Name",
        trackingType: "FULL_URL",
        destinationBaseUrl: "https://shop.example.com/x",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "immutable",
      }),
    })
    const link = (await createResponse.json()) as { id: string; utmSource: string }

    const updateResponse = await fetch(`${baseUrl}/v1/campaign-links/${link.id}`, {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name: "Renamed", customParams: { placement: "story" } }),
    })
    expect(updateResponse.status).toBe(200)
    const updated = (await updateResponse.json()) as {
      name: string
      utmSource: string
      customParams: Record<string, string>
    }
    expect(updated.name).toBe("Renamed")
    expect(updated.utmSource).toBe("google")
    expect(updated.customParams).toEqual({ placement: "story" })
  })

  it("disables, re-enables, and archives a link", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@link-lifecycle.madar",
      "Link Lifecycle Org"
    )
    const campaign = await createCampaign(baseUrl, accessToken, "Lifecycle Campaign")

    const createResponse = await fetch(`${baseUrl}/v1/campaign-links`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        campaignId: campaign.id,
        name: "Lifecycle Link",
        trackingType: "SHORT_LINK",
        destinationBaseUrl: "https://shop.example.com/lifecycle",
        utmSource: "snapchat",
        utmMedium: "cpc",
        utmCampaign: "lifecycle",
      }),
    })
    const link = (await createResponse.json()) as { id: string }

    const disableResponse = await fetch(`${baseUrl}/v1/campaign-links/${link.id}/disable`, {
      method: "POST",
      headers: authHeaders(accessToken),
    })
    expect(disableResponse.status).toBe(200)
    expect(((await disableResponse.json()) as { enabled: boolean }).enabled).toBe(false)

    const enableResponse = await fetch(`${baseUrl}/v1/campaign-links/${link.id}/enable`, {
      method: "POST",
      headers: authHeaders(accessToken),
    })
    expect(((await enableResponse.json()) as { enabled: boolean }).enabled).toBe(true)

    const archiveResponse = await fetch(`${baseUrl}/v1/campaign-links/${link.id}/archive`, {
      method: "POST",
      headers: authHeaders(accessToken),
    })
    expect(archiveResponse.status).toBe(200)

    const getAfterArchive = await fetch(`${baseUrl}/v1/campaign-links/${link.id}`, {
      headers: authHeaders(accessToken),
    })
    expect(getAfterArchive.status).toBe(404)
  })

  it("rejects a campaign link for a campaign that doesn't exist", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@link-badcampaign.madar",
      "Link Bad Campaign Org"
    )

    const response = await fetch(`${baseUrl}/v1/campaign-links`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        campaignId: "00000000-0000-4000-8000-000000000000",
        name: "Orphan Link",
        trackingType: "FULL_URL",
        destinationBaseUrl: "https://shop.example.com/orphan",
        utmSource: "x",
        utmMedium: "x",
        utmCampaign: "x",
      }),
    })
    expect(response.status).toBe(422)
  })

  it("rejects a non-https destination URL at the schema level", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@link-insecure.madar",
      "Link Insecure Org"
    )
    const campaign = await createCampaign(baseUrl, accessToken, "Insecure Campaign")

    const response = await fetch(`${baseUrl}/v1/campaign-links`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        campaignId: campaign.id,
        name: "Insecure Link",
        trackingType: "FULL_URL",
        destinationBaseUrl: "http://shop.example.com/insecure",
        utmSource: "x",
        utmMedium: "x",
        utmCampaign: "x",
      }),
    })
    expect(response.status).toBe(400)
  })
})
