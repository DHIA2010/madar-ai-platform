import { readdir, readFile } from "node:fs/promises"
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

export async function listIdentityMigrationFiles(rootPath: string) {
  const migrationsDirectory = join(rootPath, "identity-platform/migrations")
  const files = await readdir(migrationsDirectory, { withFileTypes: true })

  return files
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^[0-9]+.*\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => join(migrationsDirectory, name))
}

export async function runIdentityMigrations(database: PostgresDatabase, rootPath: string) {
  const migrationFiles = await listIdentityMigrationFiles(rootPath)
  for (const filePath of migrationFiles) {
    await runSqlFile(database, filePath)
  }
}
