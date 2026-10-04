// @vitest-environment node
//
// Proves getDateCoverage against real sync-run bookkeeping rows (pg-mem) -- the "all time" period
// (Genie-upgrade spec) must resolve to the actual earliest/latest date range that has really been
// synced, never an assumed or invented one. Reads MIN(date_start)/MAX(date_end) across each
// platform's own sync_runs table (google_ads_sync_runs / meta_sync_runs / tiktok_ads_sync_runs /
// snapchat_sync_runs) -- deliberately NOT derived from fetchAllCampaignRows' per-campaign
// aggregation, which only ever keeps the latest metric date per row and would silently lose the
// true earliest one.

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { CampaignsPerformanceAggregationService } from "../campaigns/performance-service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"

let database: PostgresDatabase
let performanceService: CampaignsPerformanceAggregationService

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

async function insertGoogleAdsConnection(): Promise<{ connectionId: string; projectId: string }> {
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

  return { connectionId, projectId }
}

async function insertGoogleAdsSyncRun(input: {
  connectionId: string
  projectId: string
  dateStart: string
  dateEnd: string
  status?: string
}) {
  const syncRunId = randomUUID()
  await database.query(
    `insert into google_ads_sync_runs (
       id, connection_id, organization_id, workspace_id, project_id, customer_id,
       date_start, date_end, idempotency_key, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11,$11,now(),now())`,
    [
      syncRunId,
      input.connectionId,
      ORG,
      WORKSPACE,
      input.projectId,
      "1112223333",
      input.dateStart,
      input.dateEnd,
      `seed-${syncRunId}`,
      input.status ?? "completed",
      USER,
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
     values ($1, 'date-coverage-test@madar.test', 'hash', 'Test', now())`,
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

  performanceService = new CampaignsPerformanceAggregationService(database)
})

describe("CampaignsPerformanceAggregationService.getDateCoverage", () => {
  it("returns the real MIN(date_start)/MAX(date_end) across multiple completed sync runs, not an assumed range", async () => {
    const { connectionId, projectId } = await insertGoogleAdsConnection()
    await insertGoogleAdsSyncRun({
      connectionId,
      projectId,
      dateStart: "2024-03-10",
      dateEnd: "2024-03-10",
    })
    await insertGoogleAdsSyncRun({
      connectionId,
      projectId,
      dateStart: "2025-01-15",
      dateEnd: "2025-06-20",
    })

    const coverage = await performanceService.getDateCoverage(actor())
    expect(coverage.earliestDate).toBe("2024-03-10")
    expect(coverage.latestDate).toBe("2025-06-20")
  })

  it("ignores a sync run that never completed", async () => {
    const { connectionId, projectId } = await insertGoogleAdsConnection()
    await insertGoogleAdsSyncRun({
      connectionId,
      projectId,
      dateStart: "2024-01-01",
      dateEnd: "2024-01-01",
    })
    await insertGoogleAdsSyncRun({
      connectionId,
      projectId,
      dateStart: "2020-01-01",
      dateEnd: "2020-01-01",
      status: "failed",
    })

    const coverage = await performanceService.getDateCoverage(actor())
    expect(coverage.earliestDate).toBe("2024-01-01")
  })

  it("returns null/null when the organization has no completed sync runs at all", async () => {
    const coverage = await performanceService.getDateCoverage(actor())
    expect(coverage.earliestDate).toBeNull()
    expect(coverage.latestDate).toBeNull()
  })

  it("never returns another organization's sync coverage", async () => {
    const { connectionId, projectId } = await insertGoogleAdsConnection()
    await insertGoogleAdsSyncRun({
      connectionId,
      projectId,
      dateStart: "2024-01-01",
      dateEnd: "2024-01-01",
    })

    const otherOrgActor: AuthenticatedActor = {
      userId: USER,
      sessionId: randomUUID(),
      organizationId: randomUUID(),
      workspaceId: null,
      roles: ["owner"],
      modulePermissions: ["ai:view"],
    }
    const coverage = await performanceService.getDateCoverage(otherOrgActor)
    expect(coverage.earliestDate).toBeNull()
    expect(coverage.latestDate).toBeNull()
  })
})
