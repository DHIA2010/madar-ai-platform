// @vitest-environment node

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
      fullName: "Campaigns Journey Test",
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
     values ($1, $2, 'hash', 'Campaigns Journey Test', now()) on conflict (id) do nothing`,
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

  return { login, actor }
}

function authHeaders(login: { session: { accessToken: string } }) {
  return { authorization: `Bearer ${login.session.accessToken}` }
}

async function insertConnectedTikTokAdsConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into tiktok_ads_oauth_connections (
       id, organization_id, workspace_id, project_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,'connected',$5,$5,now(),now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), input.userId]
  )
  return connectionId
}

async function insertTikTokRecord(input: {
  connectionId: string
  customerId: string
  entityType: string
  entityId: string
  recordDate: string
  payload: Record<string, unknown>
}) {
  await database.query(
    `insert into tiktok_ads_records (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6::date,$7::jsonb,now(),now())`,
    [
      randomUUID(),
      input.connectionId,
      input.customerId,
      input.entityType,
      input.entityId,
      input.recordDate,
      JSON.stringify(input.payload),
    ]
  )
}

async function insertAttributedOrder(input: {
  organizationId: string
  connectionId: string
  externalOrderId: string
  campaignId: string
  orderCreatedAt: string
  totalAmount: number
}) {
  await database.query(
    `insert into order_attributions (
       id, organization_id, provider, connection_id, external_order_id, order_created_at,
       currency, total_amount, customer_ref, attribution_id, campaign_id, campaign_link_id,
       match_method, model_used, attribution_status
     ) values (
       $1, $2, 'zid', $3, $4, $5::timestamptz, 'SAR', $6, null, null, $7, null,
       'campaign_name_match', 'LAST_CLICK', 'ATTRIBUTED'
     )`,
    [
      randomUUID(),
      input.organizationId,
      input.connectionId,
      input.externalOrderId,
      input.orderCreatedAt,
      input.totalAmount,
      input.campaignId,
    ]
  )
}

describe("GET /v1/campaigns/performance/journey: ad spend joined with real matched sales", () => {
  it("joins a TikTok campaign's spend/clicks with real attributed order revenue", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "campaigns-journey-join@madar.test",
      "Campaigns Journey Join Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const tiktokConnectionId = await insertConnectedTikTokAdsConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertTikTokRecord({
      connectionId: tiktokConnectionId,
      customerId: "advertiser-1",
      entityType: "campaigns",
      entityId: "tt-campaign-1",
      recordDate: today,
      payload: { campaign_name: "Tiktok_Conv_Sep19", operation_status: "ENABLE" },
    })
    await insertTikTokRecord({
      connectionId: tiktokConnectionId,
      customerId: "advertiser-1",
      entityType: "insights",
      entityId: `tt-campaign-1:${today}`,
      recordDate: today,
      payload: {
        dimensions: { campaign_id: "tt-campaign-1", stat_time_day: today },
        metrics: { spend: "400", impressions: "10000", clicks: "150", conversion: "5" },
      },
    })

    // Imports the TikTok campaign into the shared campaigns table -- the journey endpoint
    // itself never writes to it, only reads what's already imported (same as the Link
    // Builder's own "Import" button, or OrderAttributionService.matchOrders()'s auto-reimport).
    const syncResponse = await fetch(`${baseUrl}/v1/campaigns/sync`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ platform: "tiktok_ads" }),
    })
    expect(syncResponse.status).toBe(200)
    const synced = (await syncResponse.json()) as { campaigns: Array<{ id: string }> }
    expect(synced.campaigns).toHaveLength(1)
    const campaignId = synced.campaigns[0].id

    await insertAttributedOrder({
      organizationId: actor.organizationId,
      connectionId: tiktokConnectionId,
      externalOrderId: "zid-order-journey-1",
      campaignId,
      orderCreatedAt: `${today}T12:00:00Z`,
      totalAmount: 250,
    })

    const journeyResponse = await fetch(`${baseUrl}/v1/campaigns/performance/journey`, {
      headers: authHeaders(login),
    })
    expect(journeyResponse.status).toBe(200)
    const journey = (await journeyResponse.json()) as {
      items: Array<{
        campaignId: string | null
        platform: string | null
        name: string
        spend: number
        clicks: number
        orders: number
        revenue: number
        roas: number
      }>
    }

    expect(journey.items).toHaveLength(1)
    const row = journey.items[0]
    expect(row.campaignId).toBe(campaignId)
    expect(row.platform).toBe("TikTok")
    expect(row.name).toBe("Tiktok_Conv_Sep19")
    expect(row.spend).toBe(400)
    expect(row.clicks).toBe(150)
    expect(row.orders).toBe(1)
    expect(row.revenue).toBe(250)
    expect(row.roas).toBe(0.63)
  })

  it("still shows a campaign with real matched sales but no ad-KPI row in range, spend-side zero", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "campaigns-journey-sales-only@madar.test",
      "Campaigns Journey Sales Only Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const tiktokConnectionId = await insertConnectedTikTokAdsConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    // Campaign metadata exists (so it can be imported) but no insight rows in range at all --
    // a real campaign that's simply quiet right now, not a broken sync.
    await insertTikTokRecord({
      connectionId: tiktokConnectionId,
      customerId: "advertiser-1",
      entityType: "campaigns",
      entityId: "tt-campaign-quiet",
      recordDate: today,
      payload: { campaign_name: "Quiet Campaign", operation_status: "ENABLE" },
    })

    const syncResponse = await fetch(`${baseUrl}/v1/campaigns/sync`, {
      method: "POST",
      headers: { ...authHeaders(login), "content-type": "application/json" },
      body: JSON.stringify({ platform: "tiktok_ads" }),
    })
    const synced = (await syncResponse.json()) as { campaigns: Array<{ id: string }> }
    const campaignId = synced.campaigns[0].id

    await insertAttributedOrder({
      organizationId: actor.organizationId,
      connectionId: tiktokConnectionId,
      externalOrderId: "zid-order-journey-2",
      campaignId,
      orderCreatedAt: `${today}T12:00:00Z`,
      totalAmount: 80,
    })

    const journeyResponse = await fetch(`${baseUrl}/v1/campaigns/performance/journey`, {
      headers: authHeaders(login),
    })
    const journey = (await journeyResponse.json()) as {
      items: Array<{
        campaignId: string | null
        platform: string | null
        name: string
        spend: number
        orders: number
        revenue: number
      }>
    }

    // The campaign's own ad-KPI row (zero spend, real campaign) AND the sales-only fallback row
    // would double-count if both appeared -- fetchAllCampaignRows always returns a real zero-spend
    // row for a connected campaign with no insights, so this stays a single row, spend-side zero,
    // sales-side real.
    expect(journey.items).toHaveLength(1)
    const row = journey.items[0]
    expect(row.campaignId).toBe(campaignId)
    expect(row.spend).toBe(0)
    expect(row.orders).toBe(1)
    expect(row.revenue).toBe(80)
  })
})
