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
      fullName: "Channels Performance Test",
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
     values ($1, $2, 'hash', 'Channels Performance Test', now()) on conflict (id) do nothing`,
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

async function insertConnectedGoogleAdsConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
  customerId: string
  lastSyncedAt?: string
}) {
  const connectionId = randomUUID()
  const projectId = randomUUID()
  const oauthAccountId = randomUUID()

  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, 'Google Ads Project', 'active')`,
    [projectId, input.organizationId, input.workspaceId, input.userId]
  )
  await database.query(
    `insert into google_oauth_connections (
       id, organization_id, workspace_id, project_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,'connected',$5,$5,now(),now())`,
    [connectionId, input.organizationId, input.workspaceId, projectId, input.userId]
  )
  await database.query(
    `insert into oauth_accounts (
       id, provider_family, organization_id, workspace_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,'google',$2,$3,'active',$4,$4,now(),now())`,
    [oauthAccountId, input.organizationId, input.workspaceId, input.userId]
  )
  await database.query(
    `insert into integration_connections (
       id, provider_id, provider_family, platform, organization_id, workspace_id, project_id, oauth_account_id,
       status, last_synced_at, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,'google-ads','google','marketing',$2,$3,$4,$5,'connected',$6,$7,$7,now(),now())`,
    [
      connectionId,
      input.organizationId,
      input.workspaceId,
      projectId,
      oauthAccountId,
      input.lastSyncedAt ?? new Date().toISOString(),
      input.userId,
    ]
  )

  const syncRunId = randomUUID()
  await database.query(
    `insert into google_ads_sync_runs (
       id, connection_id, organization_id, workspace_id, project_id, customer_id,
       date_start, date_end, idempotency_key, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,'2020-01-01'::date,'2020-01-01'::date,$7,'completed',$8,$8,now(),now())`,
    [
      syncRunId,
      connectionId,
      input.organizationId,
      input.workspaceId,
      projectId,
      input.customerId,
      `seed-${syncRunId}`,
      input.userId,
    ]
  )

  return { connectionId, syncRunId }
}

async function insertGoogleCampaign(input: {
  connectionId: string
  customerId: string
  campaignId: string
  name: string
  status: string
  channelType: string
}) {
  await database.query(
    `insert into google_ads_campaigns (
       id, connection_id, customer_id, campaign_id, name, status, channel_type, payload, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,now(),now())`,
    [
      randomUUID(),
      input.connectionId,
      input.customerId,
      input.campaignId,
      input.name,
      input.status,
      input.channelType,
    ]
  )
}

async function insertGoogleCampaignMetric(input: {
  connectionId: string
  syncRunId: string
  customerId: string
  campaignId: string
  metricDate: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
  conversionValue: number
}) {
  await database.query(
    `insert into google_ads_daily_metrics (
       id, connection_id, sync_run_id, customer_id, metric_scope, metric_entity_id, campaign_id, metric_date,
       impressions, clicks, ctr, cost_micros, average_cpc, average_cpm, conversions, conversion_value,
       payload, created_at, updated_at
     ) values (
       $1,$2,$3,$4,'campaign',$5,$5,$6::date,
       $7,$8,0,$9,0,0,$10,$11,
       '{}'::jsonb,now(),now()
     )`,
    [
      randomUUID(),
      input.connectionId,
      input.syncRunId,
      input.customerId,
      input.campaignId,
      input.metricDate,
      input.impressions,
      input.clicks,
      input.costMicros,
      input.conversions,
      input.conversionValue,
    ]
  )
}

async function insertConnectedMetaConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into meta_oauth_connections (
       id, organization_id, workspace_id, project_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,'connected',$5,$5,now(),now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), input.userId]
  )
  return connectionId
}

async function insertMetaSyncRun(input: {
  connectionId: string
  organizationId: string
  workspaceId: string
  userId: string
  completedAt: string
}) {
  await database.query(
    `insert into meta_sync_runs (
       id, connection_id, organization_id, workspace_id, project_id, customer_id,
       date_start, date_end, idempotency_key, status, completed_at, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,'2020-01-01'::date,'2020-01-01'::date,$7,'completed',$8::timestamptz,$9,$9,now(),now())`,
    [
      randomUUID(),
      input.connectionId,
      input.organizationId,
      input.workspaceId,
      randomUUID(),
      "act_seed",
      `seed-${randomUUID()}`,
      input.completedAt,
      input.userId,
    ]
  )
}

async function insertMetaRecord(input: {
  connectionId: string
  customerId: string
  entityType: string
  entityId: string
  recordDate: string
  payload: Record<string, unknown>
}) {
  await database.query(
    `insert into meta_records (
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

async function insertConnectedSnapchatConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into snapchat_oauth_connections (
       id, organization_id, workspace_id, project_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,'connected',$5,$5,now(),now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), input.userId]
  )
  return connectionId
}

async function insertSnapchatRecord(input: {
  connectionId: string
  customerId: string
  entityType: string
  entityId: string
  recordDate: string
  payload: Record<string, unknown>
}) {
  await database.query(
    `insert into snapchat_records (
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

describe("GET /v1/channels/performance/*: real cross-platform channel aggregation", () => {
  it("merges Google Search+Display+YouTube into one Google Ads channel and aggregates real spend/revenue/roas across all 4 channels", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "channels-perf-merge@madar.test",
      "Channels Perf Merge Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const { connectionId: googleConnectionId, syncRunId } =
      await insertConnectedGoogleAdsConnection({
        organizationId: actor.organizationId,
        workspaceId,
        userId: actor.userId,
        customerId: "111222",
      })
    await insertGoogleCampaign({
      connectionId: googleConnectionId,
      customerId: "111222",
      campaignId: "g-search-1",
      name: "Google Search Campaign",
      status: "ENABLED",
      channelType: "SEARCH",
    })
    await insertGoogleCampaignMetric({
      connectionId: googleConnectionId,
      syncRunId,
      customerId: "111222",
      campaignId: "g-search-1",
      metricDate: today,
      impressions: 1000,
      clicks: 100,
      costMicros: 10_000_000, // 10.00
      conversions: 5,
      conversionValue: 100,
    })
    await insertGoogleCampaign({
      connectionId: googleConnectionId,
      customerId: "111222",
      campaignId: "g-display-1",
      name: "Google Display Campaign",
      status: "ENABLED",
      channelType: "DISPLAY",
    })
    await insertGoogleCampaignMetric({
      connectionId: googleConnectionId,
      syncRunId,
      customerId: "111222",
      campaignId: "g-display-1",
      metricDate: today,
      impressions: 2000,
      clicks: 50,
      costMicros: 5_000_000, // 5.00
      conversions: 1,
      conversionValue: 20,
    })

    const metaConnectionId = await insertConnectedMetaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertMetaRecord({
      connectionId: metaConnectionId,
      customerId: "act_998877",
      entityType: "campaigns",
      entityId: "m-camp-1",
      recordDate: today,
      payload: { name: "Meta Campaign", status: "ACTIVE", objective: "SALES" },
    })
    await insertMetaRecord({
      connectionId: metaConnectionId,
      customerId: "act_998877",
      entityType: "insights",
      entityId: `m-camp-1:${today}`,
      recordDate: today,
      payload: {
        campaign_id: "m-camp-1",
        spend: "30",
        impressions: "600",
        clicks: "60",
        date_start: today,
        actions: [{ action_type: "omni_purchase", value: "4" }],
        action_values: [{ action_type: "omni_purchase", value: "80" }],
      },
    })

    const tiktokConnectionId = await insertConnectedTikTokAdsConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertTikTokRecord({
      connectionId: tiktokConnectionId,
      customerId: "998877",
      entityType: "campaigns",
      entityId: "t-camp-1",
      recordDate: today,
      payload: { campaign_name: "TikTok Campaign", operation_status: "ENABLE" },
    })
    await insertTikTokRecord({
      connectionId: tiktokConnectionId,
      customerId: "998877",
      entityType: "insights",
      entityId: `t-camp-1:${today}`,
      recordDate: today,
      payload: {
        dimensions: { campaign_id: "t-camp-1", stat_time_day: today },
        metrics: { spend: "20", impressions: "400", clicks: "40", conversion: "3" },
      },
    })

    const snapchatConnectionId = await insertConnectedSnapchatConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertSnapchatRecord({
      connectionId: snapchatConnectionId,
      customerId: "snap-1",
      entityType: "campaigns",
      entityId: "s-camp-1",
      recordDate: today,
      payload: { name: "Snapchat Campaign", status: "ACTIVE", objective: "AWARENESS" },
    })
    await insertSnapchatRecord({
      connectionId: snapchatConnectionId,
      customerId: "snap-1",
      entityType: "stats",
      entityId: `s-camp-1:${today}`,
      recordDate: today,
      payload: {
        level: "campaign",
        entityId: "s-camp-1",
        startTime: today,
        spend: "15000000", // micro-currency -> 15.00
        impressions: "300",
        swipes: "12",
      },
    })

    const summaryResponse = await fetch(`${baseUrl}/v1/channels/performance/summary`, {
      headers: authHeaders(login),
    })
    expect(summaryResponse.status).toBe(200)
    const summary = (await summaryResponse.json()) as {
      spend: number
      revenue: number
      conversions: number
      activeChannels: number
      totalChannels: number
    }
    // Google(10+5) + Meta(30) + TikTok(20) + Snapchat(15) = 80
    expect(summary.spend).toBe(80)
    // Google(100+20) + Meta(80) -- TikTok/Snapchat rows here have no revenue field seeded
    expect(summary.revenue).toBe(200)
    // Google(5+1) + Meta(4) + TikTok(3) = 13
    expect(summary.conversions).toBe(13)
    expect(summary.totalChannels).toBe(4)
    expect(summary.activeChannels).toBe(4)

    const breakdownResponse = await fetch(`${baseUrl}/v1/channels/performance/breakdown`, {
      headers: authHeaders(login),
    })
    expect(breakdownResponse.status).toBe(200)
    const breakdownBody = (await breakdownResponse.json()) as {
      items: Array<{ name: string; spend: number; campaigns: number; connected: boolean }>
    }
    expect(breakdownBody.items).toHaveLength(4)
    const googleAdsRow = breakdownBody.items.find((row) => row.name === "Google Ads")
    expect(googleAdsRow).toBeDefined()
    // Search(10) + Display(5) merged into one row
    expect(googleAdsRow?.spend).toBe(15)
    expect(googleAdsRow?.campaigns).toBe(2)
    expect(googleAdsRow?.connected).toBe(true)

    const snapchatRow = breakdownBody.items.find((row) => row.name === "Snapchat")
    expect(snapchatRow?.spend).toBe(15)
  })

  it("only shows channels with a real connection, and reflects honest connected-count math (not the old fake '5')", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "channels-perf-partial@madar.test",
      "Channels Perf Partial Org"
    )
    const workspaceId = actor.workspaceId as string

    await insertConnectedMetaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })

    const summaryResponse = await fetch(`${baseUrl}/v1/channels/performance/summary`, {
      headers: authHeaders(login),
    })
    const summary = (await summaryResponse.json()) as {
      activeChannels: number
      totalChannels: number
    }
    expect(summary.totalChannels).toBe(4)
    expect(summary.activeChannels).toBe(1)

    const breakdownResponse = await fetch(`${baseUrl}/v1/channels/performance/breakdown`, {
      headers: authHeaders(login),
    })
    const breakdownBody = (await breakdownResponse.json()) as { items: Array<{ name: string }> }
    expect(breakdownBody.items).toHaveLength(1)
    expect(breakdownBody.items[0].name).toBe("Meta Ads")
  })

  it("computes real health tiers from connection status and last-synced age", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "channels-perf-health@madar.test",
      "Channels Perf Health Org"
    )
    const workspaceId = actor.workspaceId as string

    // Google: connected with a very recent last_synced_at -> healthy.
    await insertConnectedGoogleAdsConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      customerId: "111222",
      lastSyncedAt: new Date().toISOString(),
    })

    // Meta: connected, but no sync run has ever completed -> never_synced, not forced into a
    // "good" tier just because the connection itself is active.
    await insertConnectedMetaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })

    const response = await fetch(`${baseUrl}/v1/channels/performance/breakdown`, {
      headers: authHeaders(login),
    })
    const body = (await response.json()) as { items: Array<{ name: string; health: string }> }
    const googleRow = body.items.find((row) => row.name === "Google Ads")
    const metaRow = body.items.find((row) => row.name === "Meta Ads")
    expect(googleRow?.health).toBe("healthy")
    expect(metaRow?.health).toBe("never_synced")
  })

  it("derives a channel's last-synced time from its own sync runs when the shared connections table has no timestamp for it", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "channels-perf-sync-runs@madar.test",
      "Channels Perf Sync Runs Org"
    )
    const workspaceId = actor.workspaceId as string
    const metaConnectionId = await insertConnectedMetaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    const completedAt = new Date().toISOString()
    await insertMetaSyncRun({
      connectionId: metaConnectionId,
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      completedAt,
    })

    const response = await fetch(`${baseUrl}/v1/channels/performance/breakdown`, {
      headers: authHeaders(login),
    })
    const body = (await response.json()) as {
      items: Array<{ name: string; health: string; lastSyncedAt: string | null }>
    }
    const metaRow = body.items.find((row) => row.name === "Meta Ads")
    expect(metaRow?.health).toBe("healthy")
    expect(metaRow?.lastSyncedAt).not.toBeNull()
  })

  it("returns a time-bucketed spend trend across channels", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "channels-perf-trend@madar.test",
      "Channels Perf Trend Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const { connectionId, syncRunId } = await insertConnectedGoogleAdsConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      customerId: "111222",
    })
    await insertGoogleCampaign({
      connectionId,
      customerId: "111222",
      campaignId: "g-trend-1",
      name: "Google Trend Campaign",
      status: "ENABLED",
      channelType: "SEARCH",
    })
    await insertGoogleCampaignMetric({
      connectionId,
      syncRunId,
      customerId: "111222",
      campaignId: "g-trend-1",
      metricDate: today,
      impressions: 100,
      clicks: 10,
      costMicros: 3_000_000,
      conversions: 1,
      conversionValue: 10,
    })

    const response = await fetch(
      `${baseUrl}/v1/channels/performance/trend?startDate=${today}&endDate=${today}`,
      { headers: authHeaders(login) }
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: Array<{ bucketStart: string; spendByChannel: Record<string, number> }>
    }
    expect(body.items.length).toBeGreaterThan(0)
    const bucket = body.items.find((item) => item.spendByChannel["Google Ads"] > 0)
    expect(bucket?.spendByChannel["Google Ads"]).toBe(3)
  })

  it("rejects unauthenticated requests", async () => {
    const response = await fetch(`${baseUrl}/v1/channels/performance/summary`)
    expect(response.status).toBe(401)
  })
})

async function insertConnectedSallaConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, 'connected', $5, $5, now(), now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), input.userId]
  )
  return connectionId
}

async function insertSallaOrderRecord(input: {
  connectionId: string
  entityId: string
  payload: Record<string, unknown>
  recordDate: string
}) {
  await database.query(
    `insert into salla_records (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1, $2, 'store-1', 'orders', $3, $4::date, $5::jsonb, now(), $4::timestamptz)`,
    [
      randomUUID(),
      input.connectionId,
      input.entityId,
      input.recordDate,
      JSON.stringify(input.payload),
    ]
  )
}

async function insertSallaCustomerRecord(input: { connectionId: string; entityId: string }) {
  const today = new Date().toISOString().slice(0, 10)
  await database.query(
    `insert into salla_records (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1, $2, 'store-1', 'customers', $3, $4::date, '{}'::jsonb, now(), now())`,
    [randomUUID(), input.connectionId, input.entityId, today]
  )
}

describe("GET /v1/channels/performance/stores: real e-commerce platform aggregation", () => {
  it("aggregates real Salla orders into platform-level orders/revenue/AOV/trend, and only shows connected platforms", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "channels-perf-stores@madar.test",
      "Channels Perf Stores Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const connectionId = await insertConnectedSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertSallaOrderRecord({
      connectionId,
      entityId: "1155952133",
      recordDate: today,
      payload: {
        reference_id: 400123,
        customer: { full_name: "Sara Ahmed" },
        source: "devportal",
        total: { amount: 349, currency: "SAR" },
        status: { name: "Completed", slug: "completed" },
        items: [{ name: "فستان", quantity: 2 }],
        is_pending_payment: false,
        date: { date: `${today} 00:00:00` },
      },
    })
    await insertSallaOrderRecord({
      connectionId,
      entityId: "1155952134",
      recordDate: today,
      payload: {
        reference_id: 400124,
        customer: { full_name: "Omar Ali" },
        source: "web",
        total: { amount: 120, currency: "SAR" },
        status: { name: "Completed", slug: "completed" },
        items: [{ name: "حذاء", quantity: 1 }],
        is_pending_payment: false,
        date: { date: `${today} 00:00:00` },
      },
    })
    await insertSallaCustomerRecord({ connectionId, entityId: "cust-1" })
    await insertSallaCustomerRecord({ connectionId, entityId: "cust-2" })
    await insertSallaCustomerRecord({ connectionId, entityId: "cust-3" })

    const response = await fetch(`${baseUrl}/v1/channels/performance/stores`, {
      headers: authHeaders(login),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: Array<{
        platform: string
        customers: number
        orders: number
        revenue: number
        averageOrderValue: number
        trend: number[]
      }>
    }

    // Only Salla is connected -- Zid/Shopify must never appear despite being real platforms,
    // matching the same "connected is authoritative" honesty as the ad-spend channels above.
    expect(body.items).toHaveLength(1)
    const salla = body.items[0]
    expect(salla.platform).toBe("Salla")
    expect(salla.customers).toBe(3)
    expect(salla.orders).toBe(2)
    expect(salla.revenue).toBe(469)
    expect(salla.averageOrderValue).toBe(234.5)
    // Summed rather than asserting a specific day's bucket -- the seeded payload's date string
    // has no explicit timezone, so which UTC day it lands in depends on the machine's local
    // timezone; the sum is what actually proves the trend carries the real revenue.
    expect(salla.trend.reduce((sum, value) => sum + value, 0)).toBe(469)
  })
})

describe("GET /v1/channels/performance/products: real per-product order/quantity aggregation", () => {
  it("groups real order items by product name across orders, with no revenue field", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "channels-perf-products@madar.test",
      "Channels Perf Products Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const connectionId = await insertConnectedSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    // Same product ("فستان") ordered in two separate orders -- proves orders counts distinct
    // orders, not just occurrences, while quantitySold sums across both.
    await insertSallaOrderRecord({
      connectionId,
      entityId: "400123",
      recordDate: today,
      payload: {
        reference_id: 400123,
        customer: { full_name: "Sara" },
        source: "web",
        total: { amount: 100, currency: "SAR" },
        status: { name: "Completed", slug: "completed" },
        items: [{ name: "فستان", quantity: 3 }],
        is_pending_payment: false,
        date: { date: `${today} 10:00:00` },
      },
    })
    await insertSallaOrderRecord({
      connectionId,
      entityId: "400124",
      recordDate: today,
      payload: {
        reference_id: 400124,
        customer: { full_name: "Omar" },
        source: "web",
        total: { amount: 200, currency: "SAR" },
        status: { name: "Completed", slug: "completed" },
        items: [
          { name: "فستان", quantity: 2 },
          { name: "حذاء", quantity: 1 },
        ],
        is_pending_payment: false,
        date: { date: `${today} 10:00:00` },
      },
    })

    const response = await fetch(`${baseUrl}/v1/channels/performance/products`, {
      headers: authHeaders(login),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: Array<{ name: string; orders: number; quantitySold: number }>
    }

    const dress = body.items.find((item) => item.name === "فستان")
    expect(dress).toBeDefined()
    expect(dress?.orders).toBe(2)
    expect(dress?.quantitySold).toBe(5)
    // No revenue field on the response at all -- real order items carry no per-item price.
    expect(dress).not.toHaveProperty("revenue")

    const shoe = body.items.find((item) => item.name === "حذاء")
    expect(shoe).toMatchObject({ orders: 1, quantitySold: 1 })
  })
})
