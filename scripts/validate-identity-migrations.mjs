import { newDb } from "pg-mem"
import { runIdentityMigrations } from "../src/identity-platform/infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../src/identity-platform/infrastructure/postgres/database"

const mem = newDb({ autoCreateForeignKeyIndices: true })
const adapter = mem.adapters.createPg()
const database = new PostgresDatabase(new adapter.Pool())

await runIdentityMigrations(database, process.cwd())
process.stdout.write("identity migrations validated\n")
