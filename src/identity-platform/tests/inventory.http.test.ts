// @vitest-environment node
//
// Stock per branch (migration 128): where existing stock lives, transfers between branches, and
// purchases landing in their own branch.

import type { AddressInfo } from "node:net"
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
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
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
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

async function getProduct(id: string) {
  const result = await database.query<{ stock_quantity: string | null; cost_price: string | null }>(
    `select stock_quantity, cost_price from products where id = $1`,
    [id]
  )
  return {
    stockQuantity:
      result.rows[0].stock_quantity === null ? null : Number(result.rows[0].stock_quantity),
    costPrice: result.rows[0].cost_price === null ? null : Number(result.rows[0].cost_price),
  }
}

async function createSupplier(token: string, overrides: Record<string, unknown> = {}) {
  const response = await fetch(`${baseUrl}/v1/suppliers`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      name: "Sunrise Wholesale",
      kind: "local",
      bankDetails: {},
      companyDetails: {},
      ...overrides,
    }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function createPurchase(token: string, overrides: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/purchases`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      warehouseId: "wh-main",
      date: "2026-01-10",
      status: "pending",
      ...overrides,
    }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
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

async function branchStock(token: string, workspaceId: string, productId: string) {
  const response = await fetch(`${baseUrl}/v1/inventory/branch-stock?workspaceId=${workspaceId}`, {
    headers: authHeaders(token),
  })
  const body = (await response.json()) as { items: { productId: string; quantity: number }[] }
  return body.items.find((item) => item.productId === productId)?.quantity ?? null
}

async function transfer(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/inventory/transfers`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ transferDate: "2026-11-02", ...body }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe("inventory: stock per branch", () => {
  it("keeps existing stock in the product's own branch and moves it with a transfer", async () => {
    const { token, actor } = await signIn("transfer-main@example.com", "Transfer Main")
    const home = actor.workspaceId!
    const jeddah = await addBranch(actor.organizationId, "Jeddah")
    const productId = await seedProduct(actor.organizationId, home, { stockQuantity: 10 })

    expect(await branchStock(token, home, productId)).toBe(10)
    expect(await branchStock(token, jeddah, productId)).toBe(0)

    const created = await transfer(token, {
      fromWorkspaceId: home,
      toWorkspaceId: jeddah,
      notes: "Weekly restock",
      items: [{ productId, quantity: 4 }],
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      reference: "TRF-0001",
      fromWorkspaceName: "Transfer Main Workspace",
      toWorkspaceName: "Jeddah",
      transferDate: "2026-11-02",
      totalQuantity: 4,
      items: [{ productId, productName: "Test Product", quantity: 4 }],
    })

    expect(await branchStock(token, home, productId)).toBe(6)
    expect(await branchStock(token, jeddah, productId)).toBe(4)
    // The total across branches doesn't change.
    expect((await getProduct(productId)).stockQuantity).toBe(10)

    const second = await transfer(token, {
      fromWorkspaceId: jeddah,
      toWorkspaceId: home,
      items: [{ productId, quantity: 1 }],
    })
    expect(second.body.reference).toBe("TRF-0002")

    const list = await fetch(`${baseUrl}/v1/inventory/transfers`, { headers: authHeaders(token) })
    const items = ((await list.json()) as { items: { reference: string }[] }).items
    expect(items.map((item) => item.reference)).toEqual(["TRF-0002", "TRF-0001"])
  })

  it("refuses to move more than the branch has, or to the same branch", async () => {
    const { token, actor } = await signIn("transfer-limits@example.com", "Transfer Limits")
    const home = actor.workspaceId!
    const other = await addBranch(actor.organizationId, "Dammam")
    const productId = await seedProduct(actor.organizationId, home, { stockQuantity: 3 })

    const tooMany = await transfer(token, {
      fromWorkspaceId: home,
      toWorkspaceId: other,
      items: [{ productId, quantity: 5 }],
    })
    expect(tooMany.status).toBe(409)
    expect(tooMany.body.code).toBe("STOCK_INSUFFICIENT")

    const sameBranch = await transfer(token, {
      fromWorkspaceId: home,
      toWorkspaceId: home,
      items: [{ productId, quantity: 1 }],
    })
    expect(sameBranch.status).toBe(400)

    // Nothing moved.
    expect(await branchStock(token, home, productId)).toBe(3)
  })

  it("puts a purchase's stock in the purchase's branch", async () => {
    const { token, actor } = await signIn("transfer-purchase@example.com", "Transfer Purchase")
    const home = actor.workspaceId!
    const jeddah = await addBranch(actor.organizationId, "Jeddah")
    const productId = await seedProduct(actor.organizationId, home, { stockQuantity: 2 })
    const supplierId = String((await createSupplier(token)).body.id)

    const purchase = await createPurchase(token, {
      supplierId,
      warehouseId: jeddah,
      items: [{ productId, netUnitCost: 20, qty: 5, discount: 0, taxPercent: 0 }],
    })
    expect(purchase.status).toBe(201)

    expect(await branchStock(token, home, productId)).toBe(2)
    expect(await branchStock(token, jeddah, productId)).toBe(5)
    expect((await getProduct(productId)).stockQuantity).toBe(7)
  })

  it("settles a stock change made on the product itself into its own branch", async () => {
    const { token, actor } = await signIn("transfer-settle@example.com", "Transfer Settle")
    const home = actor.workspaceId!
    const productId = await seedProduct(actor.organizationId, home, { stockQuantity: 4 })
    expect(await branchStock(token, home, productId)).toBe(4)

    await database.query("update products set stock_quantity = 9 where id = $1", [productId])
    expect(await branchStock(token, home, productId)).toBe(9)
  })
})
