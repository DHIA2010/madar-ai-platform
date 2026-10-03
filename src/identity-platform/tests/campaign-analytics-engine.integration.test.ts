// @vitest-environment node
//
// Proves the deterministic analytics layer against REAL synced Google Ads schema (pg-mem, same
// tables a real sync run would populate) rather than mocks -- the unit tests in
// campaign-analytics-engine.test.ts cover arithmetic/edge cases in isolation; this confirms the
// full path (real tables -> CampaignsPerformanceAggregationService -> CampaignAnalyticsEngine ->
// recommendation-engine) produces sane output end to end, for the kind of "declining campaign"
// scenario section 32 of the brief describes.

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { CampaignAnalyticsEngine } from "../campaigns/analytics-engine"
import { CampaignsPerformanceAggregationService } from "../campaigns/performance-service"
import { ChannelsAggregationService } from "../channels/channels-service"
import { generateAccountRecommendation } from "../campaigns/recommendation-engine"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"

let database: PostgresDatabase
let engine: CampaignAnalyticsEngine

const ORG = randomUUID()
const USER = randomUUID()
const WORKSPACE = randomUUID()

function actor(): AuthenticatedActor {
  return {
    userId: USER,
    sessionId: randomUUID(),
    organizationId: ORG,
    workspaceId: WORKSPACE,
    roles: ["owner"],
    modulePermissions: ["ai:view"],
  }
}

async function insertConnectedGoogleAdsConnection(): Promise<{
  connectionId: string
  syncRunId: string
}> {
  const connectionId = randomUUID()
  const projectId = randomUUID()
  const oauthAccountId = randomUUID()

  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, 'Google Ads Project', 'active')`,
    [projectId, ORG, WORKSPACE, USER]
  )
  await database.query(
    `insert into google_oauth_connections (
       id, organization_id, workspace_id, project_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,'connected',$5,$5,now(),now())`,
    [connectionId, ORG, WORKSPACE, projectId, USER]
  )
  await database.query(
    `insert into oauth_accounts (
       id, provider_family, organization_id, workspace_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,'google',$2,$3,'active',$4,$4,now(),now())`,
    [oauthAccountId, ORG, WORKSPACE, USER]
  )
  await database.query(
    `insert into integration_connections (
       id, provider_id, provider_family, platform, organization_id, workspace_id, project_id, oauth_account_id,
       status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,'google-ads','google','marketing',$2,$3,$4,$5,'connected',$6,$6,now(),now())`,
    [connectionId, ORG, WORKSPACE, projectId, oauthAccountId, USER]
  )

  const syncRunId = randomUUID()
  await database.query(
    `insert into google_ads_sync_runs (
       id, connection_id, organization_id, workspace_id, project_id, customer_id,
       date_start, date_end, idempotency_key, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,'2020-01-01'::date,'2020-01-01'::date,$7,'completed',$8,$8,now(),now())`,
    [syncRunId, connectionId, ORG, WORKSPACE, projectId, "1112223333", `seed-${syncRunId}`, USER]
  )

  return { connectionId, syncRunId }
}

async function insertGoogleCampaign(input: { campaignId: string; name: string }) {
  await database.query(
    `insert into google_ads_campaigns (
       id, connection_id, customer_id, campaign_id, name, status, channel_type, payload, created_at, updated_at
     ) values ($1,(select id from google_oauth_connections limit 1),'1112223333',$2,$3,'ENABLED','SEARCH','{}'::jsonb,now(),now())`,
    [randomUUID(), input.campaignId, input.name]
  )
}

async function insertGoogleCampaignMetric(input: {
  syncRunId: string
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
       $1,(select id from google_oauth_connections limit 1),$2,'1112223333','campaign',$3,$3,$4::date,
       $5,$6,0,$7,0,0,$8,$9,
       '{}'::jsonb,now(),now()
     )`,
    [
      randomUUID(),
      input.syncRunId,
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

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'campaign-analytics-test@madar.test', 'hash', 'Test', now())`,
    [USER]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org', $2, 'active')`,
    [ORG, USER]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [WORKSPACE, ORG]
  )

  const performanceService = new CampaignsPerformanceAggregationService(database)
  const channelsService = new ChannelsAggregationService(database)
  engine = new CampaignAnalyticsEngine(performanceService, channelsService)
})

describe("campaign analytics engine against real synced Google Ads schema", () => {
  it("detects a declining campaign and recommends a budget review, from real daily metrics", async () => {
    const { syncRunId } = await insertConnectedGoogleAdsConnection()
    await insertGoogleCampaign({ campaignId: "g-camp-declining", name: "Declining Campaign" })

    // Current period: spend way up, revenue barely up -> ROAS deterioration.
    await insertGoogleCampaignMetric({
      syncRunId,
      campaignId: "g-camp-declining",
      metricDate: "2026-09-15",
      impressions: 100_000,
      clicks: 2_000,
      costMicros: 13_000_000_000, // 13,000
      conversions: 80,
      conversionValue: 42_000,
    })
    // Previous period: healthy ROAS.
    await insertGoogleCampaignMetric({
      syncRunId,
      campaignId: "g-camp-declining",
      metricDate: "2026-08-15",
      impressions: 90_000,
      clicks: 1_800,
      costMicros: 10_000_000_000, // 10,000
      conversions: 100,
      conversionValue: 46_000,
    })

    const ranges = {
      current: { from: "2026-09-01", to: "2026-09-30" },
      previous: { from: "2026-08-01", to: "2026-08-31" },
    }
    const comparison = await engine.comparePeriods(actor(), ranges)

    expect(comparison.current.spend).toBe(13_000)
    expect(comparison.previous.spend).toBe(10_000)
    const spendDelta = comparison.deltas.find((d) => d.metric === "spend")!
    expect(spendDelta.changePercent).toBe(30)

    const roasDelta = comparison.deltas.find((d) => d.metric === "roas")!
    expect(roasDelta.current).toBeCloseTo(42_000 / 13_000, 2)
    expect(roasDelta.previous).toBeCloseTo(46_000 / 10_000, 2)
    expect(roasDelta.changePercent).toBeLessThan(0)

    const drivers = engine.identifyPerformanceDrivers(comparison, "roas")
    expect(drivers.length).toBeGreaterThan(0)
    expect(drivers.every((d) => !/كان السبب|تسبب في/.test(d.narrative))).toBe(true)

    const recommendation = generateAccountRecommendation(comparison, drivers)
    expect(["budget_review", "no_action"]).toContain(recommendation.type)
    expect(recommendation.recommendedAction).not.toMatch(/\d+%/)

    const declines = await engine.getCampaignDeclines(actor(), {
      ranges,
      metric: "roas",
      limit: 5,
    })
    expect(declines).toHaveLength(1)
    expect(declines[0].name).toBe("Declining Campaign")
    expect(declines[0].id).toMatch(/^google_ads:/)
  })

  it("marks confidence insufficient for a brand-new campaign with almost no data", async () => {
    const { syncRunId } = await insertConnectedGoogleAdsConnection()
    await insertGoogleCampaign({ campaignId: "g-camp-new", name: "Brand New Campaign" })
    await insertGoogleCampaignMetric({
      syncRunId,
      campaignId: "g-camp-new",
      metricDate: "2026-09-29",
      impressions: 50,
      clicks: 2,
      costMicros: 5_000_000,
      conversions: 0,
      conversionValue: 0,
    })

    const summary = await engine.getCampaignSummary(actor(), {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    })
    expect(summary.confidence).toBe("insufficient")
  })

  it("returns zero metrics (not NaN/Infinity) for a disconnected/no-data period", async () => {
    await insertConnectedGoogleAdsConnection()
    const summary = await engine.getCampaignSummary(actor(), {
      startDate: "2020-01-01",
      endDate: "2020-01-31",
    })
    for (const value of Object.values(summary.metrics)) {
      expect(Number.isFinite(value)).toBe(true)
    }
    expect(summary.confidence).toBe("insufficient")
  })
})
