// @vitest-environment node
//
// The bell: notifications raised by real events (stock running low or out, new store orders,
// billing) and who sees them.

import type { AddressInfo } from "node:net"
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { notify } from "../notifications/service"
import { SallaSyncRepository } from "../salla-oauth/sync-repository"

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

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await database.end()
})

async function signIn(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Procurement Test",
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
     values ($1, $2, 'hash', 'Procurement Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, $2, $3, 'active', '{"posEnabled": true, "ecommerceEnabled": true, "advertisingEnabled": true}'::jsonb) on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, $3, 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId, `${orgName} Workspace`]
    )
  }

  // This file's own purpose is testing procurement CRUD behavior, not the subscription gate
  // itself -- every signed-in org here is pre-subscribed to Supply & Purchase. The gate itself is
  // covered by its own dedicated test below (an org that deliberately skips/undoes this step).
  await mergeOrgSettings(actor.organizationId, { procurementEnabled: true })

  return { token: login.session.accessToken, actor }
}

// pg-mem's jsonb `||` concatenation operator doesn't handle a cast parameter correctly -- read,
// merge in JS, and overwrite instead (same pattern ai-chat.test.ts's own setOrgSettingValue uses).
async function mergeOrgSettings(organizationId: string, patch: Record<string, unknown>) {
  const existing = await database.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1",
    [organizationId]
  )
  const merged = { ...(existing.rows[0]?.settings ?? {}), ...patch }
  await database.query("update organizations set settings = $2::jsonb where id = $1", [
    organizationId,
    JSON.stringify(merged),
  ])
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

async function seedProduct(
  organizationId: string,
  workspaceId: string | null,
  overrides: { stockQuantity?: number | null; costPrice?: number | null } = {}
) {
  const id = randomUUID()
  await database.query(
    `insert into products
       (id, organization_id, workspace_id, product_type, name, sku, status, stock_quantity, cost_price)
     values ($1, $2, $3, 'simple', 'Test Product', $4, 'active', $5, $6)`,
    [
      id,
      organizationId,
      workspaceId,
      `SKU-${id.slice(0, 8)}`,
      overrides.stockQuantity === undefined ? 10 : overrides.stockQuantity,
      overrides.costPrice === undefined ? 20 : overrides.costPrice,
    ]
  )
  return id
}

async function addBranch(organizationId: string, name: string) {
  const id = randomUUID()
  await database.query(
    `insert into workspaces (id, organization_id, name, status, created_at)
     values ($1, $2, $3, 'active', now() + interval '1 minute')`,
    [id, organizationId, name]
  )
  return id
}

async function transfer(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/inventory/transfers`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ transferDate: "2026-11-02", ...body }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

interface NotificationsBody {
  items: { id: string; type: string; params: Record<string, unknown>; read: boolean }[]
  unreadCount: number
}

async function bell(token: string) {
  const response = await fetch(`${baseUrl}/v1/notifications`, { headers: authHeaders(token) })
  return (await response.json()) as NotificationsBody
}

async function setMinStock(productId: string, minStock: number) {
  await database.query("update products set min_stock = $2 where id = $1", [productId, minStock])
}

describe("notifications", () => {
  it("warns when a branch runs low, then out, once each, and tracks what's read", async () => {
    const { token, actor } = await signIn("bell-stock@example.com", "Bell Stock")
    const home = actor.workspaceId!
    const other = await addBranch(actor.organizationId, "Jeddah")
    const productId = await seedProduct(actor.organizationId, home, { stockQuantity: 5 })
    await setMinStock(productId, 3)

    // 5 -> 4: still above the minimum, nothing to say.
    await transfer(token, {
      fromWorkspaceId: home,
      toWorkspaceId: other,
      items: [{ productId, quantity: 1 }],
    })
    expect((await bell(token)).items).toEqual([])

    // 4 -> 2: crosses the minimum.
    await transfer(token, {
      fromWorkspaceId: home,
      toWorkspaceId: other,
      items: [{ productId, quantity: 2 }],
    })
    let notifications = await bell(token)
    expect(notifications.unreadCount).toBe(1)
    expect(notifications.items[0]).toMatchObject({
      type: "stock_low",
      read: false,
      params: {
        productName: "Test Product",
        quantity: 2,
        minStock: 3,
        branchName: "Bell Stock Workspace",
      },
    })

    // 2 -> 1: already below, no repeat. 1 -> 0: out of stock.
    await transfer(token, {
      fromWorkspaceId: home,
      toWorkspaceId: other,
      items: [{ productId, quantity: 1 }],
    })
    await transfer(token, {
      fromWorkspaceId: home,
      toWorkspaceId: other,
      items: [{ productId, quantity: 1 }],
    })
    notifications = await bell(token)
    expect(notifications.items.map((item) => item.type)).toEqual(["stock_out", "stock_low"])

    await fetch(`${baseUrl}/v1/notifications/read`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ids: [notifications.items[1].id] }),
    })
    expect((await bell(token)).unreadCount).toBe(1)
    await fetch(`${baseUrl}/v1/notifications/read-all`, {
      method: "POST",
      headers: authHeaders(token),
    })
    const after = await bell(token)
    expect(after.unreadCount).toBe(0)
    expect(after.items.every((item) => item.read)).toBe(true)
  })

  it("announces new recent store orders once, but not a store's old history", async () => {
    const { token, actor } = await signIn("bell-orders@example.com", "Bell Orders")
    const connectionId = randomUUID()
    await database.query(
      `insert into salla_oauth_connections
         (id, organization_id, workspace_id, project_id, status, created_by_user_id, updated_by_user_id)
       values ($1, $2, $3, $4, 'connected', $5, $5)`,
      [connectionId, actor.organizationId, actor.workspaceId, randomUUID(), actor.userId]
    )
    const repository = new SallaSyncRepository(database)
    const order = (id: string, date: string) => ({
      entityType: "orders" as const,
      entityId: id,
      recordDate: date.slice(0, 10),
      payload: {
        reference_id: Number(id),
        customer: { full_name: "Sara Ahmed" },
        total: { amount: 250, currency: "SAR" },
        date: { date },
      },
    })

    // Connecting a store imports old orders: no notification for those.
    await repository.upsertRecords({
      connectionId,
      customerId: "store-1",
      records: [order("1001", "2025-01-10T10:00:00Z")],
    })
    expect((await bell(token)).items).toEqual([])

    const now = new Date().toISOString()
    await repository.upsertRecords({
      connectionId,
      customerId: "store-1",
      records: [order("1002", now)],
    })
    // Syncing the same order again doesn't repeat it.
    await repository.upsertRecords({
      connectionId,
      customerId: "store-1",
      records: [order("1002", now)],
    })
    const notifications = await bell(token)
    expect(notifications.items).toHaveLength(1)
    expect(notifications.items[0]).toMatchObject({
      type: "order_new",
      params: { platform: "salla", orderNumber: "1002", customerName: "Sara Ahmed", amount: 250 },
    })

    // Many at once become one summary.
    await repository.upsertRecords({
      connectionId,
      customerId: "store-1",
      records: ["2001", "2002", "2003", "2004"].map((id) => order(id, now)),
    })
    expect((await bell(token)).items[0]).toMatchObject({
      type: "orders_new_batch",
      params: { platform: "salla", count: 4 },
    })
  })

  it("keeps each organization's notifications, and permission-only ones, to who may see them", async () => {
    const own = await signIn("bell-own@example.com", "Bell Own")
    const other = await signIn("bell-other@example.com", "Bell Other")
    await notify(database, {
      organizationId: own.actor.organizationId,
      type: "payment_failed",
      audience: "admin",
      params: { application: "pos", amount: 99, currency: "SAR" },
    })
    await notify(database, {
      organizationId: own.actor.organizationId,
      type: "sync_failed",
      audience: "no-one-has-this" as "admin",
      params: {},
    })

    // The owner sees the admin notification; nobody holds the made-up permission.
    expect((await bell(own.token)).items.map((item) => item.type)).toEqual(["payment_failed"])
    expect((await bell(other.token)).items).toEqual([])

    // Another organization's notification can't be marked read from here either.
    const ownId = (await bell(own.token)).items[0].id
    await fetch(`${baseUrl}/v1/notifications/read`, {
      method: "POST",
      headers: authHeaders(other.token),
      body: JSON.stringify({ ids: [ownId] }),
    })
    expect((await bell(own.token)).unreadCount).toBe(1)
  })
})
