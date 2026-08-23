// @vitest-environment node

import type { AddressInfo } from "node:net"
import { randomUUID } from "node:crypto"

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
      fullName: "Campaigns Test Owner",
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
     values ($1, $2, 'hash', 'Campaigns Test Owner', now()) on conflict (id) do nothing`,
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

  return {
    accessToken: login.session.accessToken,
    organizationId: actor.organizationId,
    workspaceId: actor.workspaceId,
    userId: actor.userId,
  }
}

function authHeaders(accessToken: string) {
  return { "content-type": "application/json", authorization: `Bearer ${accessToken}` }
}

describe("campaigns", () => {
  it("creates a native campaign and lists it", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@campaigns-test.madar",
      "Campaigns Test Org"
    )

    const createResponse = await fetch(`${baseUrl}/v1/campaigns`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ displayName: "Summer Sale 2026", objective: "conversions" }),
    })
    expect(createResponse.status).toBe(201)
    const created = (await createResponse.json()) as {
      id: string
      source: string
      normalizedName: string
    }
    expect(created.source).toBe("native")
    expect(created.normalizedName).toBe("summer-sale-2026")

    const listResponse = await fetch(`${baseUrl}/v1/campaigns`, {
      headers: authHeaders(accessToken),
    })
    expect(listResponse.status).toBe(200)
    const list = (await listResponse.json()) as { items: Array<{ id: string }> }
    expect(list.items.some((item) => item.id === created.id)).toBe(true)
  })

  it("imports campaigns from Google Ads without duplicating on re-sync", async () => {
    const { accessToken, organizationId, userId } = await registerAndProvisionOrg(
      "owner@campaigns-import.madar",
      "Campaigns Import Org"
    )

    const projectId = randomUUID()
    await database.query(
      `insert into projects (id, organization_id, owner_user_id, name, status)
       values ($1, $2, $3, 'Project', 'active')`,
      [projectId, organizationId, userId]
    )

    // google_ads_campaigns.connection_id references integration_connections(id) since the
    // 010_google_ads_connection_identity_unification migration, not google_oauth_connections --
    // pg-mem's constraint-drop/re-add handling for that migration is flaky in-memory, so this
    // also seeds a matching google_oauth_connections row to satisfy whichever FK is active here.
    const connectionId = randomUUID()
    await database.query(
      `insert into integration_connections (
        id, provider_id, provider_family, platform, organization_id, project_id,
        status, created_by_user_id, updated_by_user_id
      ) values ($1, 'google-ads', 'google', 'marketing', $2, $3, 'connected', $4, $4)`,
      [connectionId, organizationId, projectId, userId]
    )
    await database.query(
      `insert into google_oauth_connections (
        id, organization_id, project_id, status, created_by_user_id, updated_by_user_id
      ) values ($1, $2, $3, 'connected', $4, $4)`,
      [connectionId, organizationId, projectId, userId]
    )

    await database.query(
      `insert into google_ads_campaigns (id, connection_id, customer_id, campaign_id, name, status)
       values ($1, $2, '1234567890', 'gc-1', 'Winter Promo', 'ENABLED')`,
      [randomUUID(), connectionId]
    )

    const firstSync = await fetch(`${baseUrl}/v1/campaigns/sync`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ platform: "google_ads" }),
    })
    expect(firstSync.status).toBe(200)
    const firstResult = (await firstSync.json()) as {
      imported: number
      campaigns: Array<{
        id: string
        displayName: string
        status: string
        externalCampaignId: string
      }>
    }
    expect(firstResult.imported).toBe(1)
    expect(firstResult.campaigns[0].displayName).toBe("Winter Promo")
    expect(firstResult.campaigns[0].status).toBe("active")

    const importedListResponse = await fetch(`${baseUrl}/v1/campaigns/imported`, {
      headers: authHeaders(accessToken),
    })
    const importedList = (await importedListResponse.json()) as { items: Array<{ id: string }> }
    expect(importedList.items).toHaveLength(1)

    // Re-running the sync must update the existing row, not create a duplicate.
    const secondSync = await fetch(`${baseUrl}/v1/campaigns/sync`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ platform: "google_ads" }),
    })
    const secondResult = (await secondSync.json()) as { campaigns: Array<{ id: string }> }
    expect(secondResult.campaigns[0].id).toBe(firstResult.campaigns[0].id)

    const importedListAfter = await fetch(`${baseUrl}/v1/campaigns/imported`, {
      headers: authHeaders(accessToken),
    })
    const importedListAfterJson = (await importedListAfter.json()) as { items: unknown[] }
    expect(importedListAfterJson.items).toHaveLength(1)
  })

  it("rejects an unauthenticated request and an unknown platform", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@campaigns-reject.madar",
      "Campaigns Reject Org"
    )

    const unauthenticated = await fetch(`${baseUrl}/v1/campaigns`)
    expect(unauthenticated.status).toBe(401)

    const invalidPlatform = await fetch(`${baseUrl}/v1/campaigns/sync`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ platform: "not_a_real_platform" }),
    })
    expect(invalidPlatform.status).toBe(400)
  })
})
