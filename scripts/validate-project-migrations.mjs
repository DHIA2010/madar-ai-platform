import { newDb } from "pg-mem"

import { PostgresDatabase } from "../src/identity-platform/infrastructure/postgres/database"
import {
  runIdentityMigrations,
  runSqlFile,
} from "../src/identity-platform/infrastructure/postgres/migration-runner"

const mem = newDb({ autoCreateForeignKeyIndices: true })
const adapter = mem.adapters.createPg()
const database = new PostgresDatabase(new adapter.Pool())

await runIdentityMigrations(database, process.cwd())
await runSqlFile(database, `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`)

process.stdout.write("project migrations validated\n")
