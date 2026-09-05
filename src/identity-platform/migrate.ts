// Migration-only entrypoint, run as a one-off ECS task during deploy (see
// .github/workflows/deploy-containers.yml) so schema changes actually reach the target database.
//
// Deploys previously only started the server (Dockerfile.backend's CMD) and never applied
// migrations, so a shipped migration silently never ran -- migration 044 reached stage as code
// while zid_oauth_connections.store_domain didn't exist, and the Zid tracking resolve route
// threw a 500 in production until it was applied by hand.
//
// Deliberately does NOT seed anything, unlike scripts/local-backend-bootstrap.ts (which inserts a
// hardcoded local admin user and demo org) -- that script must never run against a real
// environment. Every migration file is written to be re-runnable (create ... if not exists,
// drop constraint if exists + add constraint), and the runner replays all of them in order on
// every invocation, so running this repeatedly is safe and converges to the same schema.
import { Pool } from "pg"

import { PostgresDatabase } from "./infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "./infrastructure/postgres/migration-runner"

// Both migration sets are copied into the image at these paths (see Dockerfile.backend), so the
// root is /app in the container and the repo root when run locally.
const ROOT_PATH = process.env.MIGRATION_ROOT_PATH ?? process.cwd()

async function main() {
  const connectionString = process.env.IDENTITY_PLATFORM_POSTGRES_URL
  if (!connectionString) {
    throw new Error("IDENTITY_PLATFORM_POSTGRES_URL is required to run migrations.")
  }

  const pool = new Pool({ connectionString, max: 2 })
  const database = new PostgresDatabase(pool)

  try {
    await runIdentityMigrations(database, ROOT_PATH)
    await runSqlFile(database, `${ROOT_PATH}/src/project-platform/migrations/001_project_core.sql`)
    console.log("[migrate] migrations applied")
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[migrate] failed", error)
  process.exit(1)
})
