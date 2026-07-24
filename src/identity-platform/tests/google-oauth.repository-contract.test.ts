// @vitest-environment node

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { GoogleOAuthRepository } from "../google-oauth/repository"

const OWNER_ID = "8ea3eb0d-aec8-4c11-abeb-77f2fbe2eb6e"
const ORG_ID = "4cb4ce1c-c83c-4efd-af08-e7981fbfd9a4"
const WORKSPACE_ID = "2ca352b5-ed8e-497d-9542-e66f2fe69bc1"
const PROJECT_ID = "95cf004a-15b2-41e3-af5e-a9e10c4368f6"
const CONNECTION_ID = "e1f57ce5-47e1-49f2-b9a5-04bd4a874b45"
const OAUTH_ACCOUNT_ID = "31f57ce5-47e1-49f2-b9a5-04bd4a874b45"

let database: PostgresDatabase
let repository: GoogleOAuthRepository

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  repository = new GoogleOAuthRepository(database)

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(database, `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'owner2@madar.test', 'hash', 'Owner2', now())`,
    [OWNER_ID]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Org', $2, 'active')`,
    [ORG_ID, OWNER_ID]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, 'Workspace', 'active')`,
    [WORKSPACE_ID, ORG_ID]
  )
  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, 'Project', 'active')`,
    [PROJECT_ID, ORG_ID, WORKSPACE_ID, OWNER_ID]
  )
})

afterEach(async () => {
  await database.end()
})

describe("google oauth repository contract", () => {
  it("resolves project and upserts connection state without data source synchronization", async () => {
    const resolved = await repository.resolveProject({
      organizationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    })

    expect(resolved.projectId).toBe(PROJECT_ID)

    await repository.upsertConnection({
      id: CONNECTION_ID,
      oauthAccountId: OAUTH_ACCOUNT_ID,
      organizationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      dataSourceId: null,
      providerAccountId: "provider-1",
      providerAccountName: "Account Name",
      providerAccountEmail: "ads@example.com",
      encryptedRefreshToken: "encrypted-refresh",
      encryptedAccessToken: "encrypted-access",
      scopes: ["scope.a", "scope.b"],
      tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: "connected",
      connectionReference: CONNECTION_ID,
      lastConnectedAt: new Date().toISOString(),
      lastDisconnectedAt: null,
      actorUserId: OWNER_ID,
      nowIso: new Date().toISOString(),
    })

    const loaded = await repository.findConnectionById(CONNECTION_ID)
    expect(loaded?.projectId).toBe(PROJECT_ID)
    expect(loaded?.status).toBe("connected")

    const sourceCount = await database.query<{ count: string }>(
      "select count(*)::text as count from data_sources where project_id = $1 and type = 'google_ads'",
      [PROJECT_ID]
    )
    expect(Number(sourceCount.rows[0]?.count ?? "0")).toBe(0)
  })

  it("deletes connection and all related onboarding and sync metadata", async () => {
    await repository.upsertConnection({
      id: CONNECTION_ID,
      oauthAccountId: OAUTH_ACCOUNT_ID,
      organizationId: ORG_ID,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      dataSourceId: null,
      providerAccountId: "provider-1",
      providerAccountName: "Account Name",
      providerAccountEmail: "ads@example.com",
      encryptedRefreshToken: "encrypted-refresh",
      encryptedAccessToken: "encrypted-access",
      scopes: ["scope.a"],
      tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: "connected",
      connectionReference: CONNECTION_ID,
      lastConnectedAt: new Date().toISOString(),
      lastDisconnectedAt: null,
      actorUserId: OWNER_ID,
      nowIso: new Date().toISOString(),
    })

    await database.query(
      `insert into oauth_states (
        id, state, provider_family, provider_product,
        organization_id, workspace_id, project_id, user_id, oauth_account_id,
        requested_scopes, redirect_uri, status, expires_at, created_at, updated_at
      ) values ($1,'state-delete','google','ads',$2,$3,$4,$5,$6,'["scope.a"]'::jsonb,'https://localhost/callback','pending',now() + interval '10 minutes',now(),now())`,
      [
        "a1f57ce5-47e1-49f2-b9a5-04bd4a874b45",
        ORG_ID,
        WORKSPACE_ID,
        PROJECT_ID,
        OWNER_ID,
        OAUTH_ACCOUNT_ID,
      ]
    )

    await database.query(
      `insert into google_oauth_events (id, connection_id, event_type, metadata, created_at)
       values ($1,$2,'google.oauth.authorization.completed','{}'::jsonb,now())`,
      ["b1f57ce5-47e1-49f2-b9a5-04bd4a874b45", CONNECTION_ID]
    )

    await database.query(
      `insert into google_ads_customer_accounts (
        id, connection_id, customer_id, display_name, status, is_selected, discovered_at, created_at, updated_at
      ) values ($1,$2,'123456','Account 123','active',true,now(),now(),now())`,
      ["c1f57ce5-47e1-49f2-b9a5-04bd4a874b45", CONNECTION_ID]
    )

    await database.query(
      `insert into google_ads_sync_runs (
        id, connection_id, organization_id, workspace_id, project_id, customer_id,
        date_start, date_end, idempotency_key, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,'123456','2026-06-01','2026-06-07','idem-delete','completed',$6,$6,now(),now())`,
      [
        "d1f57ce5-47e1-49f2-b9a5-04bd4a874b45",
        CONNECTION_ID,
        ORG_ID,
        WORKSPACE_ID,
        PROJECT_ID,
        OWNER_ID,
      ]
    )

    await database.query(
      `insert into google_ads_sync_checkpoints (
        id, provider_key, connection_id, customer_id, checkpoint_key, checkpoint_version,
        checkpoint_state, last_record_date, sync_run_id, status, created_at, updated_at
      ) values ($1,'google-ads',$2,'123456','sync',1,'{}'::jsonb,'2026-06-07',$3,'completed',now(),now())`,
      [
        "e1f57ce5-47e1-49f2-b9a5-04bd4a874b45",
        CONNECTION_ID,
        "d1f57ce5-47e1-49f2-b9a5-04bd4a874b45",
      ]
    )

    await database.query(
      `insert into google_ads_sync_locks (
        id, provider_key, connection_id, project_id, organization_id, lock_token, locked_until,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1,'google-ads',$2,$3,$4,'lock-token',now() + interval '10 minutes',$5,$5,now(),now())`,
      [
        "f1f57ce5-47e1-49f2-b9a5-04bd4a874b45",
        CONNECTION_ID,
        PROJECT_ID,
        ORG_ID,
        OWNER_ID,
      ]
    )

    await database.query(
      `insert into google_ads_sync_cursors (
        id, connection_id, customer_id, entity_type, last_record_date, last_synced_at, created_at, updated_at
      ) values ($1,$2,'123456','campaign','2026-06-07',now(),now(),now())`,
      ["11f57ce5-47e1-49f2-b9a5-04bd4a874b45", CONNECTION_ID]
    )

    await database.query(
      `insert into google_ads_domain_records (
        id, connection_id, sync_run_id, entity_type, customer_id, entity_id, record_date, payload, created_at, updated_at
      ) values ($1,$2,$3,'campaign','123456','cmp-1','2026-06-01','{}'::jsonb,now(),now())`,
      [
        "21f57ce5-47e1-49f2-b9a5-04bd4a874b45",
        CONNECTION_ID,
        "d1f57ce5-47e1-49f2-b9a5-04bd4a874b45",
      ]
    )

    await repository.withTransaction(async () => {
      await repository.deleteConnectionCascade(CONNECTION_ID)
    })

    const counts = await Promise.all([
      database.query<{ count: string }>("select count(*)::text as count from google_oauth_connections where id = $1", [CONNECTION_ID]),
      database.query<{ count: string }>("select count(*)::text as count from oauth_states where oauth_account_id = $1", [OAUTH_ACCOUNT_ID]),
      database.query<{ count: string }>("select count(*)::text as count from integration_connections where id = $1", [CONNECTION_ID]),
      database.query<{ count: string }>("select count(*)::text as count from oauth_tokens where oauth_account_id = $1", [OAUTH_ACCOUNT_ID]),
      database.query<{ count: string }>("select count(*)::text as count from google_oauth_events where connection_id = $1", [CONNECTION_ID]),
      database.query<{ count: string }>("select count(*)::text as count from google_ads_customer_accounts where connection_id = $1", [CONNECTION_ID]),
      database.query<{ count: string }>("select count(*)::text as count from google_ads_sync_runs where connection_id = $1", [CONNECTION_ID]),
      database.query<{ count: string }>("select count(*)::text as count from google_ads_sync_checkpoints where connection_id = $1", [CONNECTION_ID]),
      database.query<{ count: string }>("select count(*)::text as count from google_ads_sync_locks where connection_id = $1", [CONNECTION_ID]),
      database.query<{ count: string }>("select count(*)::text as count from google_ads_sync_cursors where connection_id = $1", [CONNECTION_ID]),
      database.query<{ count: string }>("select count(*)::text as count from google_ads_domain_records where connection_id = $1", [CONNECTION_ID]),
    ])

    counts.forEach((result) => {
      expect(Number(result.rows[0]?.count ?? "0")).toBe(0)
    })
  })
})
