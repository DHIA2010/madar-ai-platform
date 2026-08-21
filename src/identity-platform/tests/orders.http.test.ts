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
      fullName: "Orders Test",
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
     values ($1, $2, 'hash', 'Orders Test', now()) on conflict (id) do nothing`,
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

async function insertOrderRecord(input: {
  connectionId: string
  entityId: string
  payload: Record<string, unknown>
  recordDate: string
}) {
  await database.query(
    `insert into salla_records (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1, $2, 'store-1', 'orders', $3, $4::date, $5::jsonb, now(), $4::timestamptz)`,
    [
      randomUUID(),
      input.connectionId,
      input.entityId,
      input.recordDate,
      JSON.stringify(input.payload),
    ]
  )
}

function authHeaders(login: { session: { accessToken: string } }) {
  return { authorization: `Bearer ${login.session.accessToken}` }
}

describe("GET /v1/orders: real order aggregation", () => {
  it("normalizes real Salla orders, buckets status/payment, and computes period summary", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "orders-full@madar.test",
      "Orders Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000002600"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Orders Full",
    })
    const connectionId = await insertConnectedSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })

    const today = new Date()
    const todayIso = today.toISOString().slice(0, 10)
    const previousPeriodDate = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    await insertOrderRecord({
      connectionId,
      entityId: "1155952133",
      recordDate: todayIso,
      payload: {
        reference_id: 400123,
        customer: { full_name: "Sara Ahmed" },
        source: "devportal",
        total: { amount: 349, currency: "SAR" },
        status: { name: "Completed", slug: "completed" },
        items: [{ name: "فستان", quantity: 2 }],
        is_pending_payment: false,
        date: { date: `${todayIso} 00:00:00` },
      },
    })
    await insertOrderRecord({
      connectionId,
      entityId: "1155952134",
      recordDate: todayIso,
      payload: {
        reference_id: 400124,
        customer: { full_name: "Omar Ali" },
        source: "web",
        total: { amount: 120, currency: "SAR" },
        status: { name: "Under review", slug: "under_review" },
        items: [{ name: "حذاء", quantity: 1 }],
        is_pending_payment: true,
        date: { date: `${todayIso} 00:00:00` },
      },
    })
    // Falls in the *previous* comparison window, not the current 30-day window -- proves the
    // summary's period-over-period delta is computed from a genuinely separate prior-window query.
    await insertOrderRecord({
      connectionId,
      entityId: "1155952100",
      recordDate: previousPeriodDate,
      payload: {
        reference_id: 400100,
        customer: { full_name: "Previous Period Customer" },
        source: "devportal",
        total: { amount: 200, currency: "SAR" },
        status: { name: "Completed", slug: "completed" },
        items: [{ name: "قميص", quantity: 1 }],
        is_pending_payment: false,
        date: { date: `${previousPeriodDate} 00:00:00` },
      },
    })

    const response = await fetch(`${baseUrl}/v1/orders`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: Array<{
        id: string
        orderNumber: string
        customerName: string
        channel: string
        platform: string
        productCount: number
        amount: number
        orderStatus: string
        paymentStatus: string
      }>
      summary: {
        totalOrders: number
        totalSales: number
        completedOrders: number
        processingOrders: number
        totalOrdersChangePct: number | null
      }
    }

    expect(body.items).toHaveLength(2)
    const completed = body.items.find((o) => o.orderNumber === "400123")
    expect(completed).toMatchObject({
      id: "salla:1155952133",
      customerName: "Sara Ahmed",
      channel: "devportal",
      platform: "Salla",
      productCount: 2,
      amount: 349,
      orderStatus: "Completed",
      paymentStatus: "Paid",
    })
    const processing = body.items.find((o) => o.orderNumber === "400124")
    expect(processing).toMatchObject({
      orderStatus: "Processing",
      paymentStatus: "Pending",
    })

    expect(body.summary.totalOrders).toBe(2)
    expect(body.summary.totalSales).toBe(469)
    expect(body.summary.completedOrders).toBe(1)
    expect(body.summary.processingOrders).toBe(1)
    // previous window had 1 order, current window has 2 -- a real, non-null percent change.
    expect(body.summary.totalOrdersChangePct).toBe(100)
  })

  it("returns an order's items for the 'view products' action", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "orders-items@madar.test",
      "Orders Items Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000002610"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Orders Items",
    })
    const connectionId = await insertConnectedSallaConnection({
      organizationId: actor.organizationId,
      workspaceId,
      userId: actor.userId,
    })
    const todayIso = new Date().toISOString().slice(0, 10)

    await insertOrderRecord({
      connectionId,
      entityId: "1155952200",
      recordDate: todayIso,
      payload: {
        reference_id: 400200,
        customer: { full_name: "Layla" },
        source: "devportal",
        total: { amount: 500, currency: "SAR" },
        status: { name: "Completed", slug: "completed" },
        items: [
          { name: "فستان", quantity: 2 },
          { name: "حقيبة", quantity: 1 },
        ],
        is_pending_payment: false,
        date: { date: `${todayIso} 00:00:00` },
      },
    })

    const response = await fetch(`${baseUrl}/v1/orders`, { headers: authHeaders(login) })
    const body = (await response.json()) as {
      items: Array<{ id: string; items: Array<{ name: string; quantity: number }> }>
    }
    const order = body.items.find((o) => o.id === "salla:1155952200")
    expect(order?.items).toEqual([
      { name: "فستان", quantity: 2 },
      { name: "حقيبة", quantity: 1 },
    ])
  })

  it("excludes orders from other organizations and disconnected connections", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "orders-scoped@madar.test",
      "Orders Scoped Org"
    )
    const { actor: otherActor } = await registerAndProvisionOrg(
      "orders-other-org@madar.test",
      "Orders Other Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000002620"
    await provisionWorkspace({
      organizationId: actor.organizationId,
      workspaceId,
      label: "Orders Scoped",
    })
    const otherWorkspaceId = otherActor.workspaceId ?? "00000000-0000-4000-8000-000000002630"
    await provisionWorkspace({
      organizationId: otherActor.organizationId,
      workspaceId: otherWorkspaceId,
      label: "Orders Other Org",
    })

    const otherOrgConnectionId = await insertConnectedSallaConnection({
      organizationId: otherActor.organizationId,
      workspaceId: otherWorkspaceId,
      userId: otherActor.userId,
    })
    await insertOrderRecord({
      connectionId: otherOrgConnectionId,
      entityId: "other-org-order",
      recordDate: new Date().toISOString().slice(0, 10),
      payload: {
        reference_id: 999999,
        customer: { full_name: "Should not appear" },
        total: { amount: 999, currency: "SAR" },
        status: { name: "Completed" },
        items: [],
      },
    })

    const response = await fetch(`${baseUrl}/v1/orders`, { headers: authHeaders(login) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(0)
  })

  it("rejects unauthenticated requests", async () => {
    const response = await fetch(`${baseUrl}/v1/orders`)
    expect(response.status).toBe(401)
  })
})
