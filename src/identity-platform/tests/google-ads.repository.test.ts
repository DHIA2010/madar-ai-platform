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
          },
        ],
        adGroups: [],
        adGroupMetrics: [],
        ads: [],
        adMetrics: [],
        keywords: [],
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
