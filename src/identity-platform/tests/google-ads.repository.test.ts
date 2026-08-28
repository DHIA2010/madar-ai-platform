// @vitest-environment node

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { GoogleAdsRepository } from "../google-ads/repository"

describe("google ads repository", () => {
  let database: PostgresDatabase
  let repository: GoogleAdsRepository

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())
    repository = new GoogleAdsRepository(database)

    await runIdentityMigrations(database, process.cwd())
    await runSqlFile(
      database,
      `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
    )

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ('00000000-0000-4000-8000-000000000001', 'owner@repo.test', 'hash', 'Owner', now())`
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ('00000000-0000-4000-8000-000000000002', 'Org', '00000000-0000-4000-8000-000000000001', 'active')`
    )
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Ws', 'active')`
    )
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Project', 'active')`
    )
    await database.query(
      `insert into google_oauth_connections (
        id, organization_id, workspace_id, project_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000005',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000004',
        'connected',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
        now(),
        now()
      )`
    )

    await database.query(
      `insert into oauth_accounts (
        id, provider_family, organization_id, workspace_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000005',
        'google',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        'active',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
        now(),
        now()
      )`
    )

    await database.query(
      `insert into integration_connections (
        id, provider_id, provider_family, platform,
        organization_id, workspace_id, project_id, oauth_account_id,
        status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000005',
        'google-ads',
        'google',
        'marketing',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000005',
        'connected',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
        now(),
        now()
      )`
    )
  })

  it("supports idempotent sync run creation and record upsert", async () => {
    const sync = await repository.createOrLoadSyncRun({
      connectionId: "00000000-0000-4000-8000-000000000005",
      organizationId: "00000000-0000-4000-8000-000000000002",
      workspaceId: "00000000-0000-4000-8000-000000000003",
      projectId: "00000000-0000-4000-8000-000000000004",
      customerId: "123456",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      idempotencyKey: "idem-1",
      actorUserId: "00000000-0000-4000-8000-000000000001",
    })

    const syncAgain = await repository.createOrLoadSyncRun({
      connectionId: "00000000-0000-4000-8000-000000000005",
      organizationId: "00000000-0000-4000-8000-000000000002",
      workspaceId: "00000000-0000-4000-8000-000000000003",
      projectId: "00000000-0000-4000-8000-000000000004",
      customerId: "123456",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      idempotencyKey: "idem-1",
      actorUserId: "00000000-0000-4000-8000-000000000001",
    })

    expect(syncAgain.id).toBe(sync.id)

    const count = await repository.upsertBundle({
      syncRunId: sync.id,
      connectionId: "00000000-0000-4000-8000-000000000005",
      customerId: "123456",
      bundle: {
        customers: [
          {
            id: "123456",
            name: "Acct",
            currencyCode: "USD",
            timeZone: "UTC",
            manager: false,
            level: 0,
            parentCustomerId: null,
          },
        ],
        campaigns: [
          {
            id: "cmp1",
            customerId: "123456",
            name: "Campaign",
            status: "ENABLED",
            budgetMicros: 1000,
            biddingStrategyType: "MANUAL_CPC",
          },
        ],
        campaignMetrics: [
          {
            campaignId: "cmp1",
            customerId: "123456",
            date: "2026-06-01",
            costMicros: 100,
            clicks: 5,
            impressions: 100,
            ctr: 0.05,
            cpcMicros: 20,
            cpmMicros: 1000,
            conversions: 1,
            conversionValue: 50,
            roas: 0.5,
            searchImpressionShare: 0.75,
            searchTopImpressionShare: 0.6,
            searchAbsoluteTopImpressionShare: 0.4,
            activeViewImpressions: 80,
            activeViewMeasurableImpressions: 90,
            activeViewMeasurableCostMicros: 95,
            activeViewViewability: 0.88,
            videoViews: 40,
            videoQuartileP25Rate: 0.9,
            videoQuartileP50Rate: 0.7,
            videoQuartileP75Rate: 0.5,
            videoQuartileP100Rate: 0.3,
            averageWatchTimeSeconds: 12.5,
          },
        ],
        adGroups: [],
        adGroupMetrics: [],
        ads: [],
        adMetrics: [],
        keywords: [
          {
            id: "kw1",
            adGroupId: "ag1",
            campaignId: "cmp1",
            customerId: "123456",
            text: "running shoes",
            matchType: "EXACT",
            status: "ENABLED",
            qualityScore: 7,
          },
        ],
        keywordMetrics: [],
        searchTerms: [],
        geoMetrics: [],
        deviceMetrics: [],
        conversionActions: [],
      },
    })

    expect(count).toBeGreaterThanOrEqual(3)

    const records = await repository.listRecords({
      connectionId: "00000000-0000-4000-8000-000000000005",
      customerId: "123456",
      pageSize: 20,
    })

    expect(records.length).toBeGreaterThanOrEqual(3)

    const metricRow = await database.query<{
      search_impression_share: string
      active_view_viewability: string
      video_quartile_p100_rate: string
      average_watch_time_seconds: string
    }>(
      `select search_impression_share, active_view_viewability, video_quartile_p100_rate, average_watch_time_seconds
       from google_ads_daily_metrics where metric_scope = 'campaign' and metric_entity_id = 'cmp1'`
    )
    expect(Number(metricRow.rows[0]?.search_impression_share)).toBeCloseTo(0.75)
    expect(Number(metricRow.rows[0]?.active_view_viewability)).toBeCloseTo(0.88)
    expect(Number(metricRow.rows[0]?.video_quartile_p100_rate)).toBeCloseTo(0.3)
    expect(Number(metricRow.rows[0]?.average_watch_time_seconds)).toBeCloseTo(12.5)

    const keywordRow = await database.query<{ quality_score: number }>(
      `select quality_score from google_ads_keywords where keyword_id = 'kw1'`
    )
    expect(keywordRow.rows[0]?.quality_score).toBe(7)
  })

  it("persists checkpoints and respects expired lock recovery", async () => {
    const acquired = await repository.acquireSyncLock({
      providerKey: "google-ads",
      connectionId: "00000000-0000-4000-8000-000000000005",
      projectId: "00000000-0000-4000-8000-000000000004",
      organizationId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      leaseSeconds: 1,
    })

    expect(acquired).not.toBeNull()

    await database.query(
      `update google_ads_sync_locks set locked_until = now() - interval '1 minute' where provider_key = $1 and connection_id = $2 and project_id = $3`,
      ["google-ads", "00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000004"]
    )

    const recovered = await repository.acquireSyncLock({
      providerKey: "google-ads",
      connectionId: "00000000-0000-4000-8000-000000000005",
      projectId: "00000000-0000-4000-8000-000000000004",
      organizationId: "00000000-0000-4000-8000-000000000002",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      leaseSeconds: 1,
    })

    expect(recovered).not.toBeNull()

    await database.query(
      `insert into google_ads_sync_runs (
        id, connection_id, organization_id, workspace_id, project_id, customer_id,
        date_start, date_end, idempotency_key, status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,'running',$10,$10,now(),now())`,
      [
        "00000000-0000-4000-8000-000000000006",
        "00000000-0000-4000-8000-000000000005",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
        "00000000-0000-4000-8000-000000000004",
        "123456",
        "2026-06-01",
        "2026-06-10",
        "idem-checkpoint",
        "00000000-0000-4000-8000-000000000001",
      ]
    )

    await repository.saveSyncCheckpoint({
      providerKey: "google-ads",
      connectionId: "00000000-0000-4000-8000-000000000005",
      customerId: "123456",
      checkpointKey: "sync",
      checkpointVersion: 1,
      checkpointState: {
        version: 1,
        mode: "incremental",
        stage: "campaignMetrics",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        counts: { customers: 1 },
      },
      lastRecordDate: "2026-06-10",
      syncRunId: "00000000-0000-4000-8000-000000000006",
      status: "in_progress",
    })

    const checkpoint = await repository.loadSyncCheckpoint({
      providerKey: "google-ads",
      connectionId: "00000000-0000-4000-8000-000000000005",
      customerId: "123456",
    })

    expect(checkpoint?.checkpointState).toMatchObject({
      stage: "campaignMetrics",
      mode: "incremental",
    })
  })
})
