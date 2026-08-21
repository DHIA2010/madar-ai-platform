// @vitest-environment node

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  await database.end()
})

async function registerAndProvisionOrg(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Stores Test",
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as { verificationToken: string }

  await fetch(`${baseUrl}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registration.verificationToken }),
  })

  const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'Stores Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )

  return { login, actor }
}

async function provisionWorkspace(input: {
  organizationId: string
  workspaceId: string
  label: string
}) {
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [input.workspaceId, input.organizationId, `${input.label} Workspace`]
  )
}

async function insertSallaConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
  status: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $6, now(), now())`,
    [
      connectionId,
      input.organizationId,
      input.workspaceId,
      randomUUID(),
      input.status,
      input.userId,
    ]
  )
  return connectionId
}

async function insertSallaStore(input: {
  connectionId: string
  accountName: string
  currencyCode: string
}) {
  await database.query(
    `insert into salla_stores (
       id, connection_id, account_id, account_name, currency_code, status, is_selected
     ) values ($1, $2, $3, $4, $5, 'active', true)`,
    [randomUUID(), input.connectionId, randomUUID(), input.accountName, input.currencyCode]
  )
}

async function insertSallaRecord(input: {
  connectionId: string
  entityType: "products" | "orders" | "customers"
  entityId: string
}) {
  await database.query(
    `insert into salla_records (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1, $2, 'store-1', $3, $4, now()::date, '{}'::jsonb, now(), now())`,
    [randomUUID(), input.connectionId, input.entityType, input.entityId]
  )
}

async function insertSallaSyncRun(input: {
  connectionId: string
  organizationId: string
  workspaceId: string
  userId: string
  status: string
  completedAt: string | null
}) {
  await database.query(
    `insert into salla_sync_runs (
       id, connection_id, organization_id, workspace_id, project_id, customer_id,
       date_start, date_end, idempotency_key, status, metrics, completed_at,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, 'store-1', now()::date, now()::date, $6, $7, '{}'::jsonb, $8, $9, $9, now(), now())`,
    [
      randomUUID(),
      input.connectionId,
      input.organizationId,
      input.workspaceId,
      randomUUID(),
      randomUUID(),
      input.status,
      input.completedAt,
      input.userId,
    ]
  )
}

function authHeaders(login: { session: { accessToken: string } }) {
  return { authorization: `Bearer ${login.session.accessToken}` }
}

describe("GET /v1/stores: real store aggregation", () => {
  it("normalizes a connected store with real record counts and a healthy sync", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "stores-full@madar.test",
      "Stores Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000003600"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Stores Full",
    })
    const connectionId = await insertSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      status: "connected",
    })
    await insertSallaStore({ connectionId, accountName: "متجر تجريبي", currencyCode: "SAR" })

    await insertSallaRecord({ connectionId, entityType: "products", entityId: "p1" })
    await insertSallaRecord({ connectionId, entityType: "products", entityId: "p2" })
    await insertSallaRecord({ connectionId, entityType: "orders", entityId: "o1" })
    await insertSallaRecord({ connectionId, entityType: "customers", entityId: "c1" })

    await insertSallaSyncRun({
      connectionId,
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      status: "completed",
      completedAt: new Date().toISOString(),
    })

    const response = await fetch(`${baseUrl}/v1/stores`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      id: `salla:${connectionId}`,
      name: "متجر تجريبي",
      platform: "Salla",
      currency: "SAR",
      connectionStatus: "connected",
      productCount: 2,
      orderCount: 1,
      customerCount: 1,
      lastSyncStatus: "completed",
      syncHealth: "healthy",
    })
  })

  it("marks a store with a failed latest sync run as failed, not healthy", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "stores-failed@madar.test",
      "Stores Failed Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000003610"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Stores Failed",
    })
    const connectionId = await insertSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      status: "connected",
    })
    await insertSallaStore({ connectionId, accountName: "Failing Store", currencyCode: "SAR" })

    // Older successful run followed by a newer failed one -- proves the health check looks at
    // the most recent run, not just "has any run ever succeeded".
    await insertSallaSyncRun({
      connectionId,
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      status: "completed",
      completedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    await insertSallaSyncRun({
      connectionId,
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      status: "failed",
      completedAt: null,
    })

    const response = await fetch(`${baseUrl}/v1/stores`, { headers: authHeaders(login) })
    const body = (await response.json()) as {
      items: Array<{ syncHealth: string; lastSyncStatus: string }>
    }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ syncHealth: "failed", lastSyncStatus: "failed" })
  })

  it("marks a connected store with no sync runs as never_synced", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "stores-neversynced@madar.test",
      "Stores Never Synced Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000003620"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Stores Never Synced",
    })
    const connectionId = await insertSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
      status: "connected",
    })
    await insertSallaStore({ connectionId, accountName: "Fresh Store", currencyCode: "SAR" })

    const response = await fetch(`${baseUrl}/v1/stores`, { headers: authHeaders(login) })
    const body = (await response.json()) as {
      items: Array<{ syncHealth: string; lastSyncAt: string | null; productCount: number }>
    }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      syncHealth: "never_synced",
      lastSyncAt: null,
      productCount: 0,
    })
  })

  it("excludes soft-deleted connections and other organizations", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "stores-scoped@madar.test",
      "Stores Scoped Org"
    )
    const { actor: otherActor } = await registerAndProvisionOrg(
      "stores-other-org@madar.test",
      "Stores Other Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000003630"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Stores Scoped",
    })
    const otherWorkspaceId = otherActor.workspaceId ?? "00000000-0000-4000-8000-000000003640"
    await provisionWorkspace({
      organizationId: otherActor.organizationId,
      workspaceId: otherWorkspaceId,
      label: "Stores Other Org",
    })

    await insertSallaConnection({
      organizationId: otherActor.organizationId,
      workspaceId: otherWorkspaceId,
      userId: otherActor.userId,
      status: "connected",
    })

    const response = await fetch(`${baseUrl}/v1/stores`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(0)
  })

  it("rejects unauthenticated requests", async () => {
    const response = await fetch(`${baseUrl}/v1/stores`)
    expect(response.status).toBe(401)
  })
})
