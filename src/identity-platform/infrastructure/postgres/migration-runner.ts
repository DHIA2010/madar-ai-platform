import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { PostgresDatabase } from "./database"

export async function runSqlFile(database: PostgresDatabase, filePath: string) {
  const sql = await readFile(filePath, "utf8")
  const statements = sql
    .split(/;\s*\n/g)
    .map((statement) => statement.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await database.query(statement)
  }
}

export async function runIdentityMigrations(database: PostgresDatabase, rootPath: string) {
  await runSqlFile(database, join(rootPath, "identity-platform/migrations/001_identity_core.sql"))
  await runSqlFile(database, join(rootPath, "identity-platform/migrations/002_identity_production_foundation.sql"))
  await runSqlFile(database, join(rootPath, "identity-platform/migrations/003_google_oauth_connections.sql"))
  await runSqlFile(database, join(rootPath, "identity-platform/migrations/004_google_ads_integration_layer.sql"))
  await runSqlFile(database, join(rootPath, "identity-platform/migrations/005_google_ads_account_onboarding.sql"))
  await runSqlFile(database, join(rootPath, "identity-platform/migrations/006_snapchat_oauth_connections.sql"))
}
