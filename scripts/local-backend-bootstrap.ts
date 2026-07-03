import { setTimeout as sleep } from "node:timers/promises"

import { loadIdentityPlatformConfig } from "../src/identity-platform/configuration"
import { ScryptPasswordHasher } from "../src/identity-platform/infrastructure/jwt/token-service"
import { PostgresDatabase } from "../src/identity-platform/infrastructure/postgres/database"
import {
  runIdentityMigrations,
  runSqlFile,
} from "../src/identity-platform/infrastructure/postgres/migration-runner"
import { NodeRedisClient } from "../src/identity-platform/infrastructure/redis/node-redis-client"

const ADMIN_USER = {
  id: "7db8d622-4d80-48a4-b671-843f6a3001e5",
  email: "admin@madar.local",
  password: "MadarAdmin123!",
  fullName: "MADAR Local Admin",
}

const DEMO = {
  organizationId: "f0297ad6-697b-4f14-86d0-c44c89fdfa6f",
  workspaceId: "edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9",
  membershipId: "6e2f9e24-f2f3-44d5-87af-f46463fba3f5",
  projectId: "af3f7a4b-cf08-46ab-bfec-1f1002fc91ca",
  dataSourceId: "9fb8cbf4-b25b-4fbc-8ee8-ff7f05a8f2e5",
}

const DEFAULT_ATTEMPTS = Number(process.env.LOCAL_BOOTSTRAP_MAX_ATTEMPTS ?? 60)
const DEFAULT_DELAY_MS = Number(process.env.LOCAL_BOOTSTRAP_DELAY_MS ?? 2000)

async function retryUntilOk(name: string, action: () => Promise<void>) {
  for (let attempt = 1; attempt <= DEFAULT_ATTEMPTS; attempt += 1) {
    try {
      await action()
      console.log(`[bootstrap] ${name} is healthy (attempt ${attempt})`)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === DEFAULT_ATTEMPTS) {
        throw new Error(`[bootstrap] ${name} failed after ${DEFAULT_ATTEMPTS} attempts: ${message}`)
      }
      console.log(
        `[bootstrap] waiting for ${name} (attempt ${attempt}/${DEFAULT_ATTEMPTS}): ${message}`
      )
      await sleep(DEFAULT_DELAY_MS)
    }
  }
}

async function waitForMinio() {
  const healthUrl = process.env.MINIO_HEALTHCHECK_URL ?? "http://minio:9000/minio/health/live"
  await retryUntilOk("minio", async () => {
    const response = await fetch(healthUrl)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  })
}

async function waitForPostgres(database: PostgresDatabase) {
  await retryUntilOk("postgres", async () => {
    const health = await database.healthCheck()
    if (!health.ok) {
      throw new Error(health.message)
    }
  })
}

async function waitForRedis(redis: NodeRedisClient) {
  await retryUntilOk("redis", async () => {
    const response = await redis.ping()
    if (response !== "PONG") {
      throw new Error(`unexpected ping response: ${response}`)
    }
  })
}

async function runMigrations(database: PostgresDatabase) {
  const rootPath = process.env.ROOT_PATH ?? process.cwd()
  await runIdentityMigrations(database, rootPath)
  await runSqlFile(database, `${rootPath}/src/project-platform/migrations/001_project_core.sql`)
  console.log("[bootstrap] migrations applied")
}

async function upsertProjectData(database: PostgresDatabase) {
  await database.withTransaction(async () => {
    await database.query(
      `insert into projects (
        id, organization_id, workspace_id, owner_user_id, name, status, environment,
        metadata, branding, settings, notification_preferences, feature_flags, connector_preferences
      ) values (
        $1, $2, $3, $4, $5, 'active', 'development',
        '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do update set
        organization_id = excluded.organization_id,
        workspace_id = excluded.workspace_id,
        owner_user_id = excluded.owner_user_id,
        name = excluded.name,
        status = 'active',
        environment = 'development',
        updated_at = now()`,
      [DEMO.projectId, DEMO.organizationId, DEMO.workspaceId, ADMIN_USER.id, "Demo Project"]
    )

    await database.query(
      `insert into data_sources (
        id, project_id, organization_id, name, type, status,
        validation_status, health_status, sync_status, connection_status, metadata
      ) values (
        $1, $2, $3, $4, 'rest_api', 'enabled',
        'valid', 'healthy', 'idle', 'connected',
        '{"baseUrl":"https://example.local/api","provider":"demo"}'::jsonb
      )
      on conflict (id) do update set
        project_id = excluded.project_id,
        organization_id = excluded.organization_id,
        name = excluded.name,
        status = 'enabled',
        validation_status = 'valid',
        health_status = 'healthy',
        sync_status = 'idle',
        connection_status = 'connected',
        metadata = excluded.metadata,
        updated_at = now()`,
      [DEMO.dataSourceId, DEMO.projectId, DEMO.organizationId, "Demo Datasource"]
    )
  })
}

async function seedDevelopmentData(database: PostgresDatabase) {
  const passwordHash = new ScryptPasswordHasher().hash(ADMIN_USER.password)

  await database.withTransaction(async () => {
    await database.query(
      `insert into users (
        id, email, password_hash, full_name, timezone, language, account_status,
        email_verified_at, preferences, failed_login_count, primary_organization_id, active_workspace_id
      ) values (
        $1, $2, $3, $4, 'UTC', 'en', 'active', now(), '{}'::jsonb, 0, null, null
      )
      on conflict (id) do update set
        email = excluded.email,
        password_hash = excluded.password_hash,
        full_name = excluded.full_name,
        account_status = 'active',
        email_verified_at = now(),
        updated_at = now()`,
      [ADMIN_USER.id, ADMIN_USER.email, passwordHash, ADMIN_USER.fullName]
    )

    await database.query(
      `insert into organizations (
        id, name, owner_user_id, status, metadata, settings, branding, timezone, locale, currency
      ) values (
        $1, $2, $3, 'active', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'UTC', 'en', 'USD'
      )
      on conflict (id) do update set
        name = excluded.name,
        owner_user_id = excluded.owner_user_id,
        status = 'active',
        updated_at = now()`,
      [DEMO.organizationId, "Demo Organization", ADMIN_USER.id]
    )

    await database.query(
      `insert into workspaces (
        id, organization_id, name, status, metadata, settings
      ) values (
        $1, $2, $3, 'active', '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do update set
        name = excluded.name,
        status = 'active',
        updated_at = now()`,
      [DEMO.workspaceId, DEMO.organizationId, "Demo Workspace"]
    )

    await database.query(
      `insert into memberships (
        id, user_id, organization_id, workspace_id, role_code, status,
        accepted_at, invited_by_user_id, metadata, history, role_history
      ) values (
        $1, $2, $3, $4, 'owner', 'active', now(), $2,
        '{}'::jsonb,
        '[{"status":"active","changedAt":"seed"}]'::jsonb,
        '[{"role":"owner","changedAt":"seed"}]'::jsonb
      )
      on conflict (id) do update set
        role_code = 'owner',
        status = 'active',
        accepted_at = now(),
        updated_at = now()`,
      [DEMO.membershipId, ADMIN_USER.id, DEMO.organizationId, DEMO.workspaceId]
    )

    await database.query(
      `update users
       set primary_organization_id = $2,
           active_workspace_id = $3,
           updated_at = now()
       where id = $1`,
      [ADMIN_USER.id, DEMO.organizationId, DEMO.workspaceId]
    )
  })

  await upsertProjectData(database)

  const counts = await database.query<{
    users: string
    organizations: string
    workspaces: string
    projects: string
    data_sources: string
  }>(
    `select
      (select count(*)::text from users where deleted_at is null) as users,
      (select count(*)::text from organizations where deleted_at is null) as organizations,
      (select count(*)::text from workspaces where deleted_at is null) as workspaces,
      (select count(*)::text from projects where deleted_at is null) as projects,
      (select count(*)::text from data_sources where deleted_at is null) as data_sources`
  )

  console.log("[bootstrap] seed complete", {
    adminEmail: ADMIN_USER.email,
    adminPassword: ADMIN_USER.password,
    organizationId: DEMO.organizationId,
    workspaceId: DEMO.workspaceId,
    projectId: DEMO.projectId,
    dataSourceId: DEMO.dataSourceId,
    counts: counts.rows[0],
  })
}

async function main() {
  const config = loadIdentityPlatformConfig()
  const database = PostgresDatabase.fromConfig(config)
  const redis = new NodeRedisClient(config)

  try {
    await waitForPostgres(database)
    await waitForRedis(redis)
    await waitForMinio()

    await runMigrations(database)
    await seedDevelopmentData(database)

    console.log("[bootstrap] startup prerequisites completed")
  } finally {
    await redis.end()
    await database.end()
  }
}

main().catch((error) => {
  console.error("[bootstrap] failed", error)
  process.exit(1)
})
