// @vitest-environment node
//
// Proves OrdersAggregationService.getDateCoverage reads MIN(date_start)/MAX(date_end) from each
// provider's own sync_runs bookkeeping table (salla_sync_runs here), not from fetchOrderRows'
// capped, most-recently-updated-first order fetch -- which would silently truncate away the true
// oldest order for any store with more than MAX_ORDERS_PER_PROVIDER orders.

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { OrdersAggregationService } from "../orders/service"

let database: PostgresDatabase
let ordersService: OrdersAggregationService

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

async function insertConnectedSallaConnection(): Promise<string> {
  const connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, 'connected', $5, $5, now(), now())`,
    [connectionId, ORG, WORKSPACE, randomUUID(), USER]
  )
  return connectionId
}

async function insertSallaSyncRun(input: {
  connectionId: string
  dateStart: string
  dateEnd: string
  status?: string
}) {
  await database.query(
    `insert into salla_sync_runs (
       id, connection_id, organization_id, workspace_id, project_id, customer_id,
       date_start, date_end, idempotency_key, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,$5,'store-1',$6::date,$7::date,$8,$9,$10,$10,now(),now())`,
    [
      randomUUID(),
      input.connectionId,
      ORG,
      WORKSPACE,
      randomUUID(),
      input.dateStart,
      input.dateEnd,
      randomUUID(),
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

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'orders-date-coverage-test@madar.test', 'hash', 'Test', now())`,
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

  ordersService = new OrdersAggregationService(database)
})

describe("OrdersAggregationService.getDateCoverage", () => {
  it("returns the real MIN(date_start)/MAX(date_end) across completed sync runs", async () => {
    const connectionId = await insertConnectedSallaConnection()
    await insertSallaSyncRun({ connectionId, dateStart: "2023-05-01", dateEnd: "2023-05-01" })
    await insertSallaSyncRun({ connectionId, dateStart: "2025-09-01", dateEnd: "2025-10-03" })

    const coverage = await ordersService.getDateCoverage(actor())
    expect(coverage.earliestDate).toBe("2023-05-01")
    expect(coverage.latestDate).toBe("2025-10-03")
  })

  it("ignores a sync run that never completed", async () => {
    const connectionId = await insertConnectedSallaConnection()
    await insertSallaSyncRun({ connectionId, dateStart: "2024-06-01", dateEnd: "2024-06-01" })
    await insertSallaSyncRun({
      connectionId,
      dateStart: "2015-01-01",
      dateEnd: "2015-01-01",
      status: "running",
    })

    const coverage = await ordersService.getDateCoverage(actor())
    expect(coverage.earliestDate).toBe("2024-06-01")
  })

  it("returns null/null when there are no completed sync runs at all", async () => {
    const coverage = await ordersService.getDateCoverage(actor())
    expect(coverage.earliestDate).toBeNull()
    expect(coverage.latestDate).toBeNull()
  })
})
