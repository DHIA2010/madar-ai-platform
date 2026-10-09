// @vitest-environment node
//
// Covers the real backend for Suppliers / Purchases / Purchase Returns / Supplier Vouchers
// (migration 094_procurement.sql), especially the stock/cost side effect purchases and returns
// apply directly to the real products table -- the whole point of this backend.

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

  return { token: login.session.accessToken, actor }
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

async function createReturn(token: string, overrides: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/purchase-returns`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ warehouseId: "wh-main", returnDate: "2026-01-12", ...overrides }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function createVoucher(token: string, overrides: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/supplier-vouchers`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ paymentMethod: "cash", transactionDate: "2026-01-15", ...overrides }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe("procurement: suppliers", () => {
  it("creates, lists, updates (full-replace), bulk-status-changes, and soft-deletes a supplier", async () => {
    const { token } = await signIn("suppliers-crud@example.com", "Suppliers Crud")

    const created = await createSupplier(token, { name: "Sunrise Wholesale" })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      name: "Sunrise Wholesale",
      status: "active",
      code: "#SUP-0001",
    })
    const supplierId = String(created.body.id)

    const list = await fetch(`${baseUrl}/v1/suppliers`, { headers: authHeaders(token) })
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(1)

    const updated = await fetch(`${baseUrl}/v1/suppliers/${supplierId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({
        name: "Sunrise Wholesale Co.",
        kind: "international",
        bankDetails: {},
        companyDetails: {},
      }),
    })
    expect(updated.status).toBe(200)
    expect((await updated.json()) as Record<string, unknown>).toMatchObject({
      name: "Sunrise Wholesale Co.",
      kind: "international",
    })

    const bulkStatus = await fetch(`${baseUrl}/v1/suppliers/status`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ ids: [supplierId], status: "inactive" }),
    })
    expect(bulkStatus.status).toBe(200)
    expect((await bulkStatus.json()) as { updated: number }).toEqual({ updated: 1 })

    const deleted = await fetch(`${baseUrl}/v1/suppliers/${supplierId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    })
    expect(deleted.status).toBe(204)
    const afterDelete = await fetch(`${baseUrl}/v1/suppliers`, { headers: authHeaders(token) })
    expect(((await afterDelete.json()) as { items: unknown[] }).items).toHaveLength(0)
  })
})

describe("procurement: purchases update real product stock/cost", () => {
  it("increments stock and reprices via (newCost + currentCost) / (newQty + currentStock)", async () => {
    const { token, actor } = await signIn("purchase-stock@example.com", "Purchase Stock")
    const supplier = await createSupplier(token)
    const productId = await seedProduct(actor.organizationId, actor.workspaceId, {
      stockQuantity: 10,
      costPrice: 20,
    })

    const purchase = await createPurchase(token, {
      supplierId: supplier.body.id,
      items: [{ productId, netUnitCost: 30, qty: 5, discount: 0, taxPercent: 0 }],
    })
    expect(purchase.status).toBe(201)
    expect(purchase.body).toMatchObject({ code: "#PUR-0001" })

    const product = await getProduct(productId)
    expect(product.stockQuantity).toBe(15) // 10 + 5
    expect(product.costPrice).toBe((30 + 20) / (5 + 10)) // literal formula, not weighted-average
  })

  it("leaves cost_price unchanged when the purchase's unit cost already matches", async () => {
    const { token, actor } = await signIn("purchase-same-cost@example.com", "Purchase Same Cost")
    const supplier = await createSupplier(token)
    const productId = await seedProduct(actor.organizationId, actor.workspaceId, {
      stockQuantity: 10,
      costPrice: 20,
    })

    await createPurchase(token, {
      supplierId: supplier.body.id,
      items: [{ productId, netUnitCost: 20, qty: 5, discount: 0, taxPercent: 0 }],
    })

    const product = await getProduct(productId)
    expect(product.stockQuantity).toBe(15)
    expect(product.costPrice).toBe(20)
  })

  it("never flips a non-stock-tracked product (stock_quantity NULL) into a tracked one", async () => {
    const { token, actor } = await signIn("purchase-null-stock@example.com", "Purchase Null Stock")
    const supplier = await createSupplier(token)
    const productId = await seedProduct(actor.organizationId, actor.workspaceId, {
      stockQuantity: null,
      costPrice: 20,
    })

    const purchase = await createPurchase(token, {
      supplierId: supplier.body.id,
      items: [{ productId, netUnitCost: 30, qty: 5, discount: 0, taxPercent: 0 }],
    })
    expect(purchase.status).toBe(201)

    const product = await getProduct(productId)
    expect(product.stockQuantity).toBeNull()
  })

  it("does not re-apply stock/cost when an existing purchase is edited", async () => {
    const { token, actor } = await signIn("purchase-edit@example.com", "Purchase Edit")
    const supplier = await createSupplier(token)
    const productId = await seedProduct(actor.organizationId, actor.workspaceId, {
      stockQuantity: 10,
      costPrice: 20,
    })

    const purchase = await createPurchase(token, {
      supplierId: supplier.body.id,
      items: [{ productId, netUnitCost: 30, qty: 5, discount: 0, taxPercent: 0 }],
    })
    const afterCreate = await getProduct(productId)
    expect(afterCreate.stockQuantity).toBe(15)

    const edited = await fetch(`${baseUrl}/v1/purchases/${String(purchase.body.id)}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({
        supplierId: supplier.body.id,
        warehouseId: "wh-main",
        date: "2026-01-10",
        status: "received",
        items: [{ productId, netUnitCost: 30, qty: 9, discount: 0, taxPercent: 0 }],
      }),
    })
    expect(edited.status).toBe(200)

    const afterEdit = await getProduct(productId)
    expect(afterEdit.stockQuantity).toBe(15) // unchanged -- editing never re-touches stock
  })
})

describe("procurement: purchase returns", () => {
  it("decrements real stock on creation, with no floor at zero", async () => {
    const { token, actor } = await signIn("return-stock@example.com", "Return Stock")
    const supplier = await createSupplier(token)
    const productId = await seedProduct(actor.organizationId, actor.workspaceId, {
      stockQuantity: 2,
      costPrice: 20,
    })

    const purchase = await createPurchase(token, {
      supplierId: supplier.body.id,
      items: [{ productId, netUnitCost: 20, qty: 9, discount: 0, taxPercent: 0 }],
    })
    // stock is now 11 (2 + 9). Simulate other consumption (e.g. POS sales) dropping it low
    // before the return, so the return -- which is only capped by what was *purchased* (9), not
    // by current stock -- can actually be observed pushing stock negative.
    await database.query(`update products set stock_quantity = 1 where id = $1`, [productId])

    const returned = await createReturn(token, {
      purchaseId: purchase.body.id,
      items: [{ productId, qty: 9 }], // all 9 purchased units are returnable
    })
    expect(returned.status).toBe(201)
    // Returning all 9 originally-purchased units of the purchase's only line item is a full
    // return -- computed server-side, never client-set.
    expect(returned.body).toMatchObject({ code: "#RET-0001", returnQty: 9, status: "full" })

    const product = await getProduct(productId)
    expect(product.stockQuantity).toBe(-8) // 1 - 9, intentionally allowed to go negative
  })

  it("rejects returning more than was actually purchased (across repeat returns)", async () => {
    const { token, actor } = await signIn("return-overclaim@example.com", "Return Overclaim")
    const supplier = await createSupplier(token)
    const productId = await seedProduct(actor.organizationId, actor.workspaceId)

    const purchase = await createPurchase(token, {
      supplierId: supplier.body.id,
      items: [{ productId, netUnitCost: 20, qty: 5, discount: 0, taxPercent: 0 }],
    })

    const firstReturn = await createReturn(token, {
      purchaseId: purchase.body.id,
      items: [{ productId, qty: 3 }],
    })
    expect(firstReturn.status).toBe(201)
    // Only 3 of the 5 originally-purchased units came back -- a partial return.
    expect(firstReturn.body).toMatchObject({ status: "partial" })

    const secondReturn = await createReturn(token, {
      purchaseId: purchase.body.id,
      returnDate: "2026-01-13",
      items: [{ productId, qty: 3 }], // only 2 remain returnable (5 - 3)
    })
    expect(secondReturn.status).toBe(400)
  })

  it("is 'partial' when a return covers every unit of one product but leaves another untouched", async () => {
    const { token, actor } = await signIn("return-multi-line@example.com", "Return Multi Line")
    const supplier = await createSupplier(token)
    const productA = await seedProduct(actor.organizationId, actor.workspaceId)
    const productB = await seedProduct(actor.organizationId, actor.workspaceId)

    const purchase = await createPurchase(token, {
      supplierId: supplier.body.id,
      items: [
        { productId: productA, netUnitCost: 20, qty: 4, discount: 0, taxPercent: 0 },
        { productId: productB, netUnitCost: 20, qty: 2, discount: 0, taxPercent: 0 },
      ],
    })

    // Returns all 4 units of product A (its full purchased qty) but never names product B at
    // all -- not a full return of the purchase, since product B's line was never touched.
    const returned = await createReturn(token, {
      purchaseId: purchase.body.id,
      items: [{ productId: productA, qty: 4 }],
    })
    expect(returned.status).toBe(201)
    expect(returned.body).toMatchObject({ status: "partial" })
  })
})

describe("procurement: supplier vouchers", () => {
  it("creates a voucher linked to a purchase and one unlinked, both listed", async () => {
    const { token, actor } = await signIn("vouchers@example.com", "Vouchers Org")
    const supplier = await createSupplier(token)
    const productId = await seedProduct(actor.organizationId, actor.workspaceId)
    const purchase = await createPurchase(token, {
      supplierId: supplier.body.id,
      items: [{ productId, netUnitCost: 20, qty: 5, discount: 0, taxPercent: 0 }],
    })

    const linked = await createVoucher(token, {
      supplierId: supplier.body.id,
      purchaseId: purchase.body.id,
      type: "payment",
      amount: 50,
    })
    expect(linked.status).toBe(201)
    expect(linked.body).toMatchObject({ reference: "PV-0001", purchaseCode: purchase.body.code })

    const unlinked = await createVoucher(token, {
      supplierId: supplier.body.id,
      type: "receipt",
      amount: 10,
      transactionDate: "2026-01-16",
    })
    expect(unlinked.status).toBe(201)
    expect(unlinked.body).toMatchObject({ reference: "RV-0001", purchaseId: null })

    const list = await fetch(`${baseUrl}/v1/supplier-vouchers`, { headers: authHeaders(token) })
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(2)
  })
})

describe("procurement: access control", () => {
  it("keeps one organization's suppliers/purchases out of another's", async () => {
    const orgA = await signIn("org-a@example.com", "Org A")
    const orgB = await signIn("org-b@example.com", "Org B")

    const created = await createSupplier(orgA.token)
    const crossRead = await fetch(`${baseUrl}/v1/suppliers/${String(created.body.id)}`, {
      headers: authHeaders(orgB.token),
    })
    expect(crossRead.status).toBe(404)

    const list = await fetch(`${baseUrl}/v1/suppliers`, { headers: authHeaders(orgB.token) })
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(0)
  })

  it("refuses an unauthenticated read", async () => {
    expect((await fetch(`${baseUrl}/v1/suppliers`)).status).toBe(401)
    expect((await fetch(`${baseUrl}/v1/purchases`)).status).toBe(401)
  })
})
