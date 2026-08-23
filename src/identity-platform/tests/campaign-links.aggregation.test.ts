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
      fullName: "Aggregation Test Owner",
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
     values ($1, $2, 'hash', 'Aggregation Test Owner', now()) on conflict (id) do nothing`,
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

describe("campaign links aggregation", () => {
  it("rolls up clicks/orders into daily metrics and the summary keeps reflecting them after raw rows are deleted", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@aggregation-test.madar",
      "Aggregation Test Org"
    )

    const campaignResponse = await fetch(`${baseUrl}/v1/campaigns`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ displayName: "Aggregation Campaign" }),
    })
    const campaign = (await campaignResponse.json()) as { id: string }

    const linkResponse = await fetch(`${baseUrl}/v1/campaign-links`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        campaignId: campaign.id,
        name: "Aggregation Link",
        trackingType: "SHORT_LINK",
        destinationBaseUrl: "https://shop.example.com/aggregation",
        utmSource: "meta",
        utmMedium: "cpc",
        utmCampaign: "aggregation",
      }),
    })
    const link = (await linkResponse.json()) as { id: string; displayId: string }

    // Click the short link twice (two clicks, one shared session -> one distinct session).
    await fetch(`${baseUrl}/m/${link.displayId}`, { redirect: "manual" })
    await fetch(`${baseUrl}/m/${link.displayId}`, { redirect: "manual" })
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Seed one ATTRIBUTED order directly against this link (bypassing the matching chain --
    // aggregation only cares that order_attributions rows exist, not how they got there).
    await database.query(
      `INSERT INTO order_attributions (
         id, organization_id, provider, connection_id, external_order_id, order_created_at,
         currency, total_amount, campaign_id, campaign_link_id, match_method, attribution_status
       ) VALUES ($1, $2, 'shopify', $3, 'agg-order-1', now(), 'SAR', 250, $4, $5, 'utm_match', 'ATTRIBUTED')`,
      [randomUUID(), organizationId, randomUUID(), campaign.id, link.id]
    )

    const aggregateResponse = await fetch(`${baseUrl}/v1/campaign-links/aggregate`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({}),
    })
    expect(aggregateResponse.status).toBe(200)
    const aggregateResult = (await aggregateResponse.json()) as {
      campaignLinksUpdated: number
      campaignsUpdated: number
    }
    expect(aggregateResult.campaignLinksUpdated).toBe(1)
    expect(aggregateResult.campaignsUpdated).toBe(1)

    const summaryBefore = await fetch(`${baseUrl}/v1/campaign-links/summary`, {
      headers: authHeaders(accessToken),
    })
    const summaryBeforeJson = (await summaryBefore.json()) as {
      items: Array<{ id: string; clicks: number; ordersCount: number; revenue: number }>
    }
    const rowBefore = summaryBeforeJson.items.find((item) => item.id === link.id)
    expect(rowBefore?.clicks).toBe(2)
    expect(rowBefore?.ordersCount).toBe(1)
    expect(rowBefore?.revenue).toBe(250)

    // Prove the summary reads ONLY the aggregate table: delete the raw event/order rows and
    // confirm the summary is completely unaffected.
    await database.query(`DELETE FROM tracking_events WHERE campaign_link_id = $1`, [link.id])
    await database.query(`DELETE FROM order_attributions WHERE campaign_link_id = $1`, [link.id])

    const summaryAfter = await fetch(`${baseUrl}/v1/campaign-links/summary`, {
      headers: authHeaders(accessToken),
    })
    const summaryAfterJson = (await summaryAfter.json()) as {
      items: Array<{ id: string; clicks: number; ordersCount: number; revenue: number }>
    }
    const rowAfter = summaryAfterJson.items.find((item) => item.id === link.id)
    expect(rowAfter?.clicks).toBe(2)
    expect(rowAfter?.ordersCount).toBe(1)
    expect(rowAfter?.revenue).toBe(250)

    const detailResponse = await fetch(`${baseUrl}/v1/campaign-links/${link.id}/attribution`, {
      headers: authHeaders(accessToken),
    })
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as {
      daily: Array<{ clicks: number; ordersCount: number }>
      byMatchMethod: Array<{ matchMethod: string; ordersCount: number }>
    }
    expect(detail.daily.some((point) => point.clicks === 2)).toBe(true)
  })
})
