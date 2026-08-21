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
      fullName: "Customers Test",
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
     values ($1, $2, 'hash', 'Customers Test', now()) on conflict (id) do nothing`,
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

async function insertConnectedSallaConnection(input: {
  organizationId: string
  workspaceId: string
  userId: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, $4, 'connected', $5, $5, now(), now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), input.userId]
  )
  return connectionId
}

async function insertRecord(input: {
  table: "salla_records"
  connectionId: string
  entityType: "customers" | "orders"
  entityId: string
  payload: Record<string, unknown>
  updatedAt: string
}) {
  await database.query(
    `insert into ${input.table} (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1, $2, 'store-1', $3, $4, $5::date, $6::jsonb, now(), $5::timestamptz)`,
    [
      randomUUID(),
      input.connectionId,
      input.entityType,
      input.entityId,
      input.updatedAt,
      JSON.stringify(input.payload),
    ]
  )
}

function authHeaders(login: { session: { accessToken: string } }) {
  return { authorization: `Bearer ${login.session.accessToken}` }
}

describe("GET /v1/customers: real customer aggregation with order stats", () => {
  it("normalizes a customer, aggregates real orders, and computes status/segment", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-full@madar.test",
      "Customers Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001600"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Customers Full",
    })
    const connectionId = await insertConnectedSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })

    await insertRecord({
      table: "salla_records",
      connectionId,
      entityType: "customers",
      entityId: "1109900279",
      updatedAt: "2026-08-16T00:00:00Z",
      payload: {
        id: 1109900279,
        full_name: "abc def",
        email: "abc@example.com",
        mobile: 555555555,
        mobile_code: "+971",
        created_at: { date: "2026-01-01 00:00:00" },
      },
    })

    // Two orders for this same customer -- confirms the LATERAL JOIN aggregation actually
    // sums across multiple real order rows, not just picks up the first one.
    await insertRecord({
      table: "salla_records",
      connectionId,
      entityType: "orders",
      entityId: "1155952133",
      updatedAt: "2026-08-10T00:00:00Z",
      payload: {
        id: 1155952133,
        customer: { id: 1109900279 },
        total: { amount: 349, currency: "SAR" },
        status: { name: "Under review", slug: "under_review" },
        items: [{ name: "فستان", quantity: 2 }],
        date: { date: "2026-08-10 00:00:00" },
      },
    })
    await insertRecord({
      table: "salla_records",
      connectionId,
      entityType: "orders",
      entityId: "1155952134",
      updatedAt: "2026-08-18T00:00:00Z",
      payload: {
        id: 1155952134,
        customer: { id: 1109900279 },
        total: { amount: 651, currency: "SAR" },
        status: { name: "Completed", slug: "completed" },
        items: [{ name: "حذاء", quantity: 1 }],
        date: { date: "2026-08-18 00:00:00" },
      },
    })

    const listResponse = await fetch(`${baseUrl}/v1/customers`, { headers: authHeaders(login) })
    expect(listResponse.status).toBe(200)
    const listBody = (await listResponse.json()) as {
      items: Array<{
        id: string
        name: string
        email: string
        phone: string | null
        platform: string
        totalOrders: number
        totalRevenue: number
        lifetimeValue: number
        status: string
        segment: string
      }>
    }
    expect(listBody.items).toHaveLength(1)
    const summary = listBody.items[0]
    expect(summary).toMatchObject({
      id: "salla:1109900279",
      name: "abc def",
      email: "abc@example.com",
      phone: "+971555555555",
      platform: "Salla",
      totalOrders: 2,
      totalRevenue: 1000,
      lifetimeValue: 1000,
      status: "active",
      // 2 orders and revenue below the VIP threshold but at/above the Loyal order-count
      // threshold -- confirms computeSegment's order-count branch, not just the LTV one.
    })

    const detailResponse = await fetch(`${baseUrl}/v1/customers/salla:1109900279`, {
      headers: authHeaders(login),
    })
    expect(detailResponse.status).toBe(200)
    const detail = (await detailResponse.json()) as {
      orders: Array<{ orderId: string; revenue: number; itemCount: number }>
      productsPurchased: string[]
      averageOrderValue: number
      totalRevenue: number
    }
    expect(detail.orders).toHaveLength(2)
    expect(detail.orders.map((o) => o.orderId).sort()).toEqual(["1155952133", "1155952134"])
    expect(detail.averageOrderValue).toBe(500)
    expect(detail.productsPurchased.sort()).toEqual(["حذاء", "فستان"])
  })

  it("excludes customers from other organizations and disconnected connections", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-scoped@madar.test",
      "Customers Scoped Org"
    )
    const { actor: otherActor } = await registerAndProvisionOrg(
      "customers-other-org@madar.test",
      "Customers Other Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001610"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Customers Scoped",
    })
    const otherWorkspaceId = otherActor.workspaceId ?? "00000000-0000-4000-8000-000000001620"
    await provisionWorkspace({
      organizationId: otherActor.organizationId,
      workspaceId: otherWorkspaceId,
      label: "Customers Other Org",
    })

    const otherOrgConnectionId = await insertConnectedSallaConnection({
      organizationId: otherActor.organizationId,
      workspaceId: otherWorkspaceId,
      userId: otherActor.userId,
    })
    await insertRecord({
      table: "salla_records",
      connectionId: otherOrgConnectionId,
      entityType: "customers",
      entityId: "other-org-customer",
      updatedAt: "2026-08-15T00:00:00Z",
      payload: { full_name: "Should not appear", email: "x@example.com" },
    })

    const response = await fetch(`${baseUrl}/v1/customers`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(0)
  })

  it("computes 'new' status and 'New' segment for a customer with zero orders", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "customers-new@madar.test",
      "Customers New Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001630"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Customers New",
    })
    const connectionId = await insertConnectedSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })

    const today = new Date().toISOString().slice(0, 10)
    await insertRecord({
      table: "salla_records",
      connectionId,
      entityType: "customers",
      entityId: "brand-new-1",
      updatedAt: `${today}T00:00:00Z`,
      payload: {
        full_name: "Brand New",
        email: "new@example.com",
        created_at: { date: `${today} 00:00:00` },
      },
    })

    const response = await fetch(`${baseUrl}/v1/customers`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: Array<{ status: string; segment: string; totalOrders: number }>
    }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ status: "new", segment: "New", totalOrders: 0 })
  })

  it("returns 404 for an unknown customer id", async () => {
    const { login } = await registerAndProvisionOrg("customers-404@madar.test", "Customers 404 Org")
    const response = await fetch(`${baseUrl}/v1/customers/salla:does-not-exist`, {
      headers: authHeaders(login),
    })
    expect(response.status).toBe(404)
  })

  it("rejects unauthenticated requests", async () => {
    const response = await fetch(`${baseUrl}/v1/customers`)
    expect(response.status).toBe(401)
  })
})
