import { newDb } from "pg-mem"

import { PostgresDatabase } from "../src/identity-platform/infrastructure/postgres/database"
import { runSqlFile } from "../src/identity-platform/infrastructure/postgres/migration-runner"

const mem = newDb({ autoCreateForeignKeyIndices: true })
const adapter = mem.adapters.createPg()
const database = new PostgresDatabase(new adapter.Pool())

await runSqlFile(
  database,
  `${process.cwd()}/src/integration-platform/migrations/001_integration_core.sql`
)
process.stdout.write("integration migrations validated\n")
