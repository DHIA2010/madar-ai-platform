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
      fullName: "Campaigns Performance Test",
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
     values ($1, $2, 'hash', 'Campaigns Performance Test', now()) on conflict (id) do nothing`,
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
       status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,'google-ads','google','marketing',$2,$3,$4,$5,'connected',$6,$6,now(),now())`,
    [connectionId, input.organizationId, input.workspaceId, projectId, oauthAccountId, input.userId]
  )

  // google_ads_daily_metrics.sync_run_id has a not-null FK to google_ads_sync_runs -- every
  // metric row inserted directly (bypassing a real sync) needs a real parent row to reference.
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

async function insertGoogleAdGroup(input: {
  connectionId: string
  customerId: string
  campaignId: string
  adGroupId: string
  name: string
  status: string
}) {
  await database.query(
    `insert into google_ads_ad_groups (
       id, connection_id, customer_id, ad_group_id, campaign_id, name, status, payload, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,now(),now())`,
    [
      randomUUID(),
      input.connectionId,
      input.customerId,
      input.adGroupId,
      input.campaignId,
      input.name,
      input.status,
    ]
  )
}

async function insertGoogleKeyword(input: {
  connectionId: string
  customerId: string
  campaignId: string
  adGroupId: string
  keywordId: string
  text: string
  status: string
  qualityScore: number
}) {
  await database.query(
    `insert into google_ads_keywords (
       id, connection_id, customer_id, keyword_id, campaign_id, ad_group_id, keyword_text, match_type, status, quality_score, payload, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,'EXACT',$8,$9,'{}'::jsonb,now(),now())`,
    [
      randomUUID(),
      input.connectionId,
      input.customerId,
      input.keywordId,
      input.campaignId,
      input.adGroupId,
      input.text,
      input.status,
      input.qualityScore,
    ]
  )
}

async function insertGoogleAdGroupMetric(input: {
  connectionId: string
  syncRunId: string
  customerId: string
  adGroupId: string
  metricDate: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}) {
  await database.query(
    `insert into google_ads_daily_metrics (
       id, connection_id, sync_run_id, customer_id, metric_scope, metric_entity_id, ad_group_id, metric_date,
       impressions, clicks, ctr, cost_micros, average_cpc, average_cpm, conversions, conversion_value,
       payload, created_at, updated_at
     ) values (
       $1,$2,$3,$4,'ad_group',$5,$5,$6::date,
       $7,$8,0,$9,0,0,$10,0,
       '{}'::jsonb,now(),now()
     )`,
    [
      randomUUID(),
      input.connectionId,
      input.syncRunId,
      input.customerId,
      input.adGroupId,
      input.metricDate,
      input.impressions,
      input.clicks,
      input.costMicros,
      input.conversions,
    ]
  )
}

async function insertGoogleKeywordMetric(input: {
  connectionId: string
  syncRunId: string
  customerId: string
  keywordId: string
  metricDate: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
}) {
  await database.query(
    `insert into google_ads_daily_metrics (
       id, connection_id, sync_run_id, customer_id, metric_scope, metric_entity_id, keyword_id, metric_date,
       impressions, clicks, ctr, cost_micros, average_cpc, average_cpm, conversions, conversion_value,
       payload, created_at, updated_at
     ) values (
       $1,$2,$3,$4,'keyword',$5,$5,$6::date,
       $7,$8,0,$9,0,0,$10,0,
       '{}'::jsonb,now(),now()
     )`,
    [
      randomUUID(),
      input.connectionId,
      input.syncRunId,
      input.customerId,
      input.keywordId,
      input.metricDate,
      input.impressions,
      input.clicks,
      input.costMicros,
      input.conversions,
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

describe("GET /v1/campaigns/performance/*: real cross-platform aggregation", () => {
  it("aggregates real spend/clicks/conversions/revenue across Google/Meta/TikTok with period-over-period deltas", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "campaigns-perf-summary@madar.test",
      "Campaigns Perf Summary Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)
    const previousPeriodDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const { connectionId: googleConnectionId, syncRunId: googleSyncRunId } =
      await insertConnectedGoogleAdsConnection({
        organizationId: actor.organizationId,
        workspaceId,
        userId: actor.userId,
        customerId: "1112223333",
      })
    await insertGoogleCampaign({
      connectionId: googleConnectionId,
      customerId: "1112223333",
      campaignId: "g-camp-1",
      name: "Google Search Campaign",
      status: "ENABLED",
      channelType: "SEARCH",
    })
    await insertGoogleCampaignMetric({
      connectionId: googleConnectionId,
      syncRunId: googleSyncRunId,
      customerId: "1112223333",
      campaignId: "g-camp-1",
      metricDate: today,
      impressions: 1000,
      clicks: 100,
      costMicros: 50_000_000,
      conversions: 10,
      conversionValue: 200,
    })
    // Falls in the previous comparison window -- proves the delta is a real period-over-period
    // computation, not a hardcoded string (the original bug this whole feature replaces).
    await insertGoogleCampaignMetric({
      connectionId: googleConnectionId,
      syncRunId: googleSyncRunId,
      customerId: "1112223333",
      campaignId: "g-camp-1",
      metricDate: previousPeriodDate,
      impressions: 500,
      clicks: 50,
      costMicros: 25_000_000,
      conversions: 5,
      conversionValue: 100,
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
      payload: { name: "Meta Sales Campaign", status: "ACTIVE", objective: "SALES" },
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

    const response = await fetch(`${baseUrl}/v1/campaigns/performance/summary`, {
      headers: authHeaders(login),
    })
    expect(response.status).toBe(200)
    const summary = (await response.json()) as {
      impressions: number
      clicks: number
      ctr: number
      spend: number
      spendChangePct: number | null
      revenue: number
      conversions: number
      activeCampaigns: number
    }

    // Google (1000) + Meta (600) + TikTok (400) = 2000.
    expect(summary.impressions).toBe(2000)
    // Google (100) + Meta (60) + TikTok (40) = 200.
    expect(summary.clicks).toBe(200)
    // 200 clicks / 2000 impressions * 100 = 10%.
    expect(summary.ctr).toBe(10)
    // Google (50) + Meta (30) + TikTok (20) = 100.
    expect(summary.spend).toBe(100)
    // Google's conversion_value (200) + Meta's purchase action_values (80); TikTok has no
    // confirmed revenue metric wired up (deliberately, see Phase 3), so it contributes 0.
    expect(summary.revenue).toBe(280)
    // Google (10) + Meta (4) + TikTok (3) = 17.
    expect(summary.conversions).toBe(17)
    expect(summary.activeCampaigns).toBe(3)
    // Current period spend (100) vs previous period Google-only spend (25) -- real delta, not null.
    expect(summary.spendChangePct).toBe(300)
  })

  it("splits Google campaigns into Google Search/Display/YouTube platform rows via channel_type", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "campaigns-perf-platforms@madar.test",
      "Campaigns Perf Platforms Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const { connectionId, syncRunId } = await insertConnectedGoogleAdsConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      customerId: "5556667777",
    })

    for (const [campaignId, channelType, name] of [
      ["search-1", "SEARCH", "Search Campaign"],
      ["display-1", "DISPLAY", "Display Campaign"],
      ["video-1", "VIDEO", "Video Campaign"],
    ] as const) {
      await insertGoogleCampaign({
        connectionId,
        customerId: "5556667777",
        campaignId,
        name,
        status: "ENABLED",
        channelType,
      })
      await insertGoogleCampaignMetric({
        connectionId,
        syncRunId,
        customerId: "5556667777",
        campaignId,
        metricDate: today,
        impressions: 100,
        clicks: 10,
        costMicros: 5_000_000,
        conversions: 1,
        conversionValue: 10,
      })
    }

    const response = await fetch(`${baseUrl}/v1/campaigns/performance/platforms`, {
      headers: authHeaders(login),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: Array<{ platform: string; spend: number; activeCampaigns: number }>
    }

    const platforms = body.items.map((row) => row.platform).sort()
    expect(platforms).toEqual(["Google Display", "Google Search", "YouTube"])
    for (const row of body.items) {
      expect(row.spend).toBe(5)
      expect(row.activeCampaigns).toBe(1)
    }
  })

  it("drills from a Google campaign into real ad-group and keyword rows", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "campaigns-perf-google-drill@madar.test",
      "Campaigns Perf Google Drill Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const { connectionId, syncRunId } = await insertConnectedGoogleAdsConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      customerId: "1231231234",
    })
    await insertGoogleCampaign({
      connectionId,
      customerId: "1231231234",
      campaignId: "camp-drill",
      name: "Drill Campaign",
      status: "ENABLED",
      channelType: "SEARCH",
    })
    await insertGoogleCampaignMetric({
      connectionId,
      syncRunId,
      customerId: "1231231234",
      campaignId: "camp-drill",
      metricDate: today,
      impressions: 100,
      clicks: 10,
      costMicros: 5_000_000,
      conversions: 1,
      conversionValue: 10,
    })
    await insertGoogleAdGroup({
      connectionId,
      customerId: "1231231234",
      campaignId: "camp-drill",
      adGroupId: "ag-drill",
      name: "Drill Ad Group",
      status: "ENABLED",
    })
    await insertGoogleAdGroupMetric({
      connectionId,
      syncRunId,
      customerId: "1231231234",
      adGroupId: "ag-drill",
      metricDate: today,
      impressions: 80,
      clicks: 8,
      costMicros: 4_000_000,
      conversions: 1,
    })
    await insertGoogleKeyword({
      connectionId,
      customerId: "1231231234",
      campaignId: "camp-drill",
      adGroupId: "ag-drill",
      keywordId: "kw-drill",
      text: "running shoes",
      status: "ENABLED",
      qualityScore: 8,
    })
    await insertGoogleKeywordMetric({
      connectionId,
      syncRunId,
      customerId: "1231231234",
      keywordId: "kw-drill",
      metricDate: today,
      impressions: 60,
      clicks: 6,
      costMicros: 3_000_000,
      conversions: 1,
    })

    const campaignsResponse = await fetch(`${baseUrl}/v1/campaigns/performance/campaigns`, {
      headers: authHeaders(login),
    })
    const campaignsBody = (await campaignsResponse.json()) as {
      items: Array<{ id: string; name: string }>
    }
    const campaignRow = campaignsBody.items.find((row) => row.name === "Drill Campaign")
    expect(campaignRow).toBeDefined()
    expect(campaignRow?.id).toBe(`google_ads:${connectionId}:1231231234:camp-drill`)

    const adGroupsResponse = await fetch(
      `${baseUrl}/v1/campaigns/performance/ad-groups?campaignId=${encodeURIComponent(campaignRow!.id)}`,
      { headers: authHeaders(login) }
    )
    expect(adGroupsResponse.status).toBe(200)
    const adGroupsBody = (await adGroupsResponse.json()) as {
      items: Array<{ id: string; name: string; spend: number; clicks: number }>
    }
    expect(adGroupsBody.items).toHaveLength(1)
    expect(adGroupsBody.items[0]?.name).toBe("Drill Ad Group")
    expect(adGroupsBody.items[0]?.spend).toBe(4)

    const keywordsResponse = await fetch(
      `${baseUrl}/v1/campaigns/performance/keywords?adGroupId=${encodeURIComponent(adGroupsBody.items[0]!.id)}`,
      { headers: authHeaders(login) }
    )
    expect(keywordsResponse.status).toBe(200)
    const keywordsBody = (await keywordsResponse.json()) as {
      items: Array<{ name: string; spend: number; qualityScore: number }>
    }
    expect(keywordsBody.items).toHaveLength(1)
    expect(keywordsBody.items[0]?.name).toBe("running shoes")
    expect(keywordsBody.items[0]?.spend).toBe(3)
    expect(keywordsBody.items[0]?.qualityScore).toBe(8)
  })

  it("drills from a Meta campaign into real ad-set and ad rows, reducing actions for conversions/revenue", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "campaigns-perf-meta-drill@madar.test",
      "Campaigns Perf Meta Drill Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const connectionId = await insertConnectedMetaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertMetaRecord({
      connectionId,
      customerId: "act_445566",
      entityType: "campaigns",
      entityId: "m-drill-camp",
      recordDate: today,
      payload: { name: "Meta Drill Campaign", status: "ACTIVE", objective: "SALES" },
    })
    await insertMetaRecord({
      connectionId,
      customerId: "act_445566",
      entityType: "insights",
      entityId: `m-drill-camp:${today}`,
      recordDate: today,
      payload: {
        campaign_id: "m-drill-camp",
        spend: "10",
        impressions: "200",
        clicks: "20",
        date_start: today,
      },
    })
    await insertMetaRecord({
      connectionId,
      customerId: "act_445566",
      entityType: "adsets",
      entityId: "m-drill-adset",
      recordDate: today,
      payload: { name: "Meta Drill Ad Set", status: "ACTIVE", campaign_id: "m-drill-camp" },
    })
    await insertMetaRecord({
      connectionId,
      customerId: "act_445566",
      entityType: "adset_insights",
      entityId: `m-drill-adset:${today}`,
      recordDate: today,
      payload: {
        campaign_id: "m-drill-camp",
        adset_id: "m-drill-adset",
        spend: "8",
        impressions: "150",
        clicks: "15",
        date_start: today,
        actions: [{ action_type: "omni_purchase", value: "2" }],
        action_values: [{ action_type: "omni_purchase", value: "60" }],
      },
    })

    const campaignsResponse = await fetch(`${baseUrl}/v1/campaigns/performance/campaigns`, {
      headers: authHeaders(login),
    })
    const campaignsBody = (await campaignsResponse.json()) as {
      items: Array<{ id: string; name: string }>
    }
    const campaignRow = campaignsBody.items.find((row) => row.name === "Meta Drill Campaign")
    expect(campaignRow?.id).toBe(`meta_ads:${connectionId}:act_445566:m-drill-camp`)

    const adGroupsResponse = await fetch(
      `${baseUrl}/v1/campaigns/performance/ad-groups?campaignId=${encodeURIComponent(campaignRow!.id)}`,
      { headers: authHeaders(login) }
    )
    expect(adGroupsResponse.status).toBe(200)
    const adGroupsBody = (await adGroupsResponse.json()) as {
      items: Array<{ name: string; spend: number; conversions: number; revenue: number }>
    }
    expect(adGroupsBody.items).toHaveLength(1)
    expect(adGroupsBody.items[0]).toMatchObject({
      name: "Meta Drill Ad Set",
      spend: 8,
      conversions: 2,
      revenue: 60,
    })
  })

  it("drills from a Snapchat campaign into real ad-squad rows, using swipes as clicks", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "campaigns-perf-snapchat-drill@madar.test",
      "Campaigns Perf Snapchat Drill Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const connectionId = await insertConnectedSnapchatConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertSnapchatRecord({
      connectionId,
      customerId: "snap-account-1",
      entityType: "campaigns",
      entityId: "s-drill-camp",
      recordDate: today,
      payload: { name: "Snapchat Drill Campaign", status: "ACTIVE", objective: "AWARENESS" },
    })
    await insertSnapchatRecord({
      connectionId,
      customerId: "snap-account-1",
      entityType: "stats",
      entityId: `s-drill-camp:${today}`,
      recordDate: today,
      payload: {
        level: "campaign",
        entityId: "s-drill-camp",
        startTime: today,
        // Snap's Marketing API reports spend in micro-currency (1,000,000 = 1.00).
        spend: "15000000",
        impressions: "300",
        swipes: "12",
      },
    })
    await insertSnapchatRecord({
      connectionId,
      customerId: "snap-account-1",
      entityType: "ad_squads",
      entityId: "s-drill-squad",
      recordDate: today,
      payload: { name: "Snapchat Drill Ad Squad", status: "ACTIVE", campaign_id: "s-drill-camp" },
    })
    await insertSnapchatRecord({
      connectionId,
      customerId: "snap-account-1",
      entityType: "stats",
      entityId: `s-drill-squad:${today}`,
      recordDate: today,
      payload: {
        level: "ad_squad",
        entityId: "s-drill-squad",
        startTime: today,
        spend: "9000000",
        impressions: "180",
        swipes: "7",
      },
    })

    const platformsResponse = await fetch(`${baseUrl}/v1/campaigns/performance/platforms`, {
      headers: authHeaders(login),
    })
    const platformsBody = (await platformsResponse.json()) as {
      items: Array<{ platform: string; spend: number; ctr: number }>
    }
    const snapchatPlatformRow = platformsBody.items.find((row) => row.platform === "Snapchat")
    expect(snapchatPlatformRow?.spend).toBe(15)
    // 12 clicks / 300 impressions -- the platform row must carry real impressions through to
    // finalizeRow, or ctr silently computes against a hardcoded 0 and always reads 0.00%.
    expect(snapchatPlatformRow?.ctr).toBe(4)

    const campaignsResponse = await fetch(`${baseUrl}/v1/campaigns/performance/campaigns`, {
      headers: authHeaders(login),
    })
    const campaignsBody = (await campaignsResponse.json()) as {
      items: Array<{ id: string; name: string; clicks: number }>
    }
    const campaignRow = campaignsBody.items.find((row) => row.name === "Snapchat Drill Campaign")
    expect(campaignRow?.id).toBe(`snapchat_ads:${connectionId}:snap-account-1:s-drill-camp`)
    // "swipes" (12) mapped onto the shared row's clicks field -- Snapchat has no field literally
    // named "clicks".
    expect(campaignRow?.clicks).toBe(12)

    const adGroupsResponse = await fetch(
      `${baseUrl}/v1/campaigns/performance/ad-groups?campaignId=${encodeURIComponent(campaignRow!.id)}`,
      { headers: authHeaders(login) }
    )
    expect(adGroupsResponse.status).toBe(200)
    const adGroupsBody = (await adGroupsResponse.json()) as {
      items: Array<{ name: string; spend: number; clicks: number }>
    }
    expect(adGroupsBody.items).toHaveLength(1)
    expect(adGroupsBody.items[0]).toMatchObject({
      name: "Snapchat Drill Ad Squad",
      spend: 9,
      clicks: 7,
    })
  })

  it("filters campaigns by objective, bucketed from each platform's real raw objective text", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "campaigns-perf-objective@madar.test",
      "Campaigns Perf Objective Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)

    const metaConnectionId = await insertConnectedMetaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertMetaRecord({
      connectionId: metaConnectionId,
      customerId: "act_objective",
      entityType: "campaigns",
      entityId: "m-obj-sales",
      recordDate: today,
      payload: {
        name: "Meta Sales Objective Campaign",
        status: "ACTIVE",
        objective: "OUTCOME_SALES",
      },
    })
    await insertMetaRecord({
      connectionId: metaConnectionId,
      customerId: "act_objective",
      entityType: "insights",
      entityId: `m-obj-sales:${today}`,
      recordDate: today,
      payload: {
        campaign_id: "m-obj-sales",
        spend: "5",
        impressions: "50",
        clicks: "5",
        date_start: today,
      },
    })
    await insertMetaRecord({
      connectionId: metaConnectionId,
      customerId: "act_objective",
      entityType: "campaigns",
      entityId: "m-obj-awareness",
      recordDate: today,
      payload: {
        name: "Meta Awareness Objective Campaign",
        status: "ACTIVE",
        objective: "OUTCOME_AWARENESS",
      },
    })
    await insertMetaRecord({
      connectionId: metaConnectionId,
      customerId: "act_objective",
      entityType: "insights",
      entityId: `m-obj-awareness:${today}`,
      recordDate: today,
      payload: {
        campaign_id: "m-obj-awareness",
        spend: "3",
        impressions: "30",
        clicks: "3",
        date_start: today,
      },
    })

    const salesOnlyResponse = await fetch(
      `${baseUrl}/v1/campaigns/performance/campaigns?objective=Sales`,
      { headers: authHeaders(login) }
    )
    expect(salesOnlyResponse.status).toBe(200)
    const salesOnlyBody = (await salesOnlyResponse.json()) as { items: Array<{ name: string }> }
    expect(salesOnlyBody.items.map((row) => row.name)).toEqual(["Meta Sales Objective Campaign"])

    const awarenessOnlyResponse = await fetch(
      `${baseUrl}/v1/campaigns/performance/campaigns?objective=Awareness`,
      { headers: authHeaders(login) }
    )
    const awarenessOnlyBody = (await awarenessOnlyResponse.json()) as {
      items: Array<{ name: string }>
    }
    expect(awarenessOnlyBody.items.map((row) => row.name)).toEqual([
      "Meta Awareness Objective Campaign",
    ])
  })

  it("still shows a paused campaign with zero stats in the selected window, with real zeros (not hidden)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "campaigns-perf-paused-no-activity@madar.test",
      "Campaigns Perf Paused No Activity Org"
    )
    const workspaceId = actor.workspaceId as string
    const today = new Date().toISOString().slice(0, 10)
    // Far outside the default 30-day lookback window -- this campaign's only real activity is
    // old history, exactly the scenario that previously made it vanish entirely (the bug: a
    // campaign was only discoverable by grouping over insight/stat rows that exist *within* the
    // selected range, so a paused campaign with no current-window activity had no row to
    // produce at all, making it unreachable through the platforms/campaigns table).
    const longAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const connectionId = await insertConnectedSnapchatConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    await insertSnapchatRecord({
      connectionId,
      customerId: "snap-paused-account",
      entityType: "campaigns",
      entityId: "s-paused-camp",
      recordDate: today,
      payload: { name: "Paused Old Campaign", status: "PAUSED", objective: "SALES" },
    })
    // Stats exist, but only from 90 days ago -- entirely outside the default lookback window.
    await insertSnapchatRecord({
      connectionId,
      customerId: "snap-paused-account",
      entityType: "stats",
      entityId: `s-paused-camp:${longAgo}`,
      recordDate: longAgo,
      payload: {
        level: "campaign",
        entityId: "s-paused-camp",
        startTime: longAgo,
        spend: "500",
        impressions: "9000",
      },
    })

    const platformsResponse = await fetch(`${baseUrl}/v1/campaigns/performance/platforms`, {
      headers: authHeaders(login),
    })
    const platformsBody = (await platformsResponse.json()) as {
      items: Array<{ platform: string; status: string }>
    }
    const snapchatPlatformRow = platformsBody.items.find((row) => row.platform === "Snapchat")
    expect(snapchatPlatformRow).toBeDefined()
    // Not "No Data" -- this platform has a real, connected campaign, it's just paused. "No
    // Data" wrongly implies nothing was ever synced.
    expect(snapchatPlatformRow?.status).toBe("Paused")

    const campaignsResponse = await fetch(`${baseUrl}/v1/campaigns/performance/campaigns`, {
      headers: authHeaders(login),
    })
    const campaignsBody = (await campaignsResponse.json()) as {
      items: Array<{ name: string; status: string; spend: number; impressions: number }>
    }
    const pausedRow = campaignsBody.items.find((row) => row.name === "Paused Old Campaign")
    expect(pausedRow).toBeDefined()
    expect(pausedRow?.status).toBe("PAUSED")
    // Real zeros for the current window, not the 90-day-old spend -- the fix surfaces the
    // campaign, it doesn't backdate its numbers.
    expect(pausedRow?.spend).toBe(0)
    expect(pausedRow?.impressions).toBe(0)
  })

  it("rejects unauthenticated requests", async () => {
    const response = await fetch(`${baseUrl}/v1/campaigns/performance/summary`)
    expect(response.status).toBe(401)
  })
})
