// @vitest-environment node
//
// Covers a native product's own tax_rate_id override (migration 069) and its real effect on
// POST /v1/pos/invoices -- a mixed cart of standard-rated and exempt/custom-rated products is
// charged tax per line, not one blanket rate for the whole sale (invoices-service.ts's create()).

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
      fullName: "Tax Override Test",
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
     values ($1, $2, 'hash', 'Tax Override Test', now()) on conflict (id) do nothing`,
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

async function createTaxRate(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/tax-rates`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return (await response.json()) as Record<string, unknown>
}

const SIMPLE_PRODUCT_BASE = {
  productType: "simple",
  category: "عام",
  description: "",
  status: "active",
  costPrice: null,
  stockQuantity: 100,
  minStock: 0,
  baseUnit: null,
}

async function createProduct(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/products`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ...SIMPLE_PRODUCT_BASE, ...body }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe("per-product tax rate override", () => {
  it("creates a product with a real tax rate override and returns it", async () => {
    const { token } = await signIn("tax-override-create@example.com", "Tax Override Create")
    const exempt = await createTaxRate(token, {
      name: "معفاة",
      type: "exempt",
      ratePercent: 0,
      isDefault: false,
      isActive: true,
    })

    const created = await createProduct(token, {
      name: "خبز",
      sku: "SKU-BREAD",
      sellPrice: 5,
      taxRateId: exempt.id,
    })

    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ taxRateId: exempt.id })
  })

  it("refuses to delete a tax rate that a product (even a deleted one) is still assigned to", async () => {
    const { token } = await signIn("tax-override-inuse@example.com", "Tax Override In Use")
    const exempt = await createTaxRate(token, {
      name: "معفاة",
      type: "exempt",
      ratePercent: 0,
      isDefault: false,
      isActive: true,
    })
    const bread = await createProduct(token, {
      name: "خبز",
      sku: "SKU-BREAD-INUSE",
      sellPrice: 5,
      taxRateId: exempt.id,
    })

    const deleteWhileAssigned = await fetch(`${baseUrl}/v1/tax-rates/${exempt.id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    })
    expect(deleteWhileAssigned.status).toBe(409)
    expect(await deleteWhileAssigned.json()).toMatchObject({ code: "TAX_RATE_IN_USE" })

    // Still blocked after the product is only soft-deleted -- the row (and its tax_rate_id) is
    // still really there.
    await fetch(`${baseUrl}/v1/products/${bread.body.id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    })
    const deleteAfterProductArchived = await fetch(`${baseUrl}/v1/tax-rates/${exempt.id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    })
    expect(deleteAfterProductArchived.status).toBe(409)
    expect(await deleteAfterProductArchived.json()).toMatchObject({ code: "TAX_RATE_IN_USE" })
  })

  it("rejects a product referencing a tax rate that does not exist", async () => {
    const { token } = await signIn("tax-override-unknown@example.com", "Tax Override Unknown")

    const created = await createProduct(token, {
      name: "منتج",
      sku: "SKU-X",
      sellPrice: 10,
      taxRateId: "00000000-0000-0000-0000-000000000000",
    })

    expect(created.status).toBe(422)
    expect(created.body).toMatchObject({ code: "PRODUCT_UNKNOWN_TAX_RATE" })
  })

  it("charges a mixed cart per line: an exempt product and a standard-rated one in the same sale", async () => {
    const { token } = await signIn("tax-override-mixed@example.com", "Tax Override Mixed")
    // Seed the real 15% default.
    await fetch(`${baseUrl}/v1/tax-rates`, { headers: authHeaders(token) })

    const exempt = await createTaxRate(token, {
      name: "معفاة",
      type: "exempt",
      ratePercent: 0,
      isDefault: false,
      isActive: true,
    })
    const bread = await createProduct(token, {
      name: "خبز",
      sku: "SKU-BREAD-2",
      sellPrice: 10,
      taxRateId: exempt.id,
    })
    const soda = await createProduct(token, {
      name: "مشروب غازي",
      sku: "SKU-SODA",
      sellPrice: 10,
    })

    await fetch(`${baseUrl}/v1/pos/payment-methods/cash`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
    })

    // Bread (exempt, 10) + soda (standard 15%, 10) -- only the soda line is taxed: 1.50 VAT,
    // total 21.50. A single blanket 15% over the whole 20 subtotal would wrongly be 3.00/23.00.
    const created = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        customerName: null,
        customerPhone: null,
        customerId: null,
        payments: [{ paymentMethodCode: "cash", amount: 21.5 }],
        discountAmount: 0,
        notes: null,
        items: [
          {
            productId: bread.body.id,
            productName: "خبز",
            unitPrice: 10,
            quantity: 1,
          },
          {
            productId: soda.body.id,
            productName: "مشروب غازي",
            unitPrice: 10,
            quantity: 1,
          },
        ],
      }),
    })
    const invoice = (await created.json()) as Record<string, unknown>

    expect(created.status).toBe(201)
    expect(invoice).toMatchObject({ subtotalAmount: 20, taxAmount: 1.5, totalAmount: 21.5 })
  })

  it("distributes a discount proportionally across mixed-rate lines", async () => {
    const { token } = await signIn("tax-override-discount@example.com", "Tax Override Discount")
    await fetch(`${baseUrl}/v1/tax-rates`, { headers: authHeaders(token) })

    const exempt = await createTaxRate(token, {
      name: "معفاة",
      type: "exempt",
      ratePercent: 0,
      isDefault: false,
      isActive: true,
    })
    const bread = await createProduct(token, {
      name: "خبز",
      sku: "SKU-BREAD-3",
      sellPrice: 30,
      taxRateId: exempt.id,
    })
    const soda = await createProduct(token, {
      name: "مشروب غازي",
      sku: "SKU-SODA-2",
      sellPrice: 10,
    })

    await fetch(`${baseUrl}/v1/pos/payment-methods/cash`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
    })

    // Subtotal 40 (30 exempt + 10 standard), discount 8 split 75/25 by each line's share:
    // bread taxable = 30 - 6 = 24 (0% -> 0 tax), soda taxable = 10 - 2 = 8 (15% -> 1.20 tax).
    // Taxable total 32, tax 1.20, total 33.20.
    const created = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        customerName: null,
        customerPhone: null,
        customerId: null,
        payments: [{ paymentMethodCode: "cash", amount: 33.2 }],
        discountAmount: 8,
        notes: null,
        items: [
          { productId: bread.body.id, productName: "خبز", unitPrice: 30, quantity: 1 },
          { productId: soda.body.id, productName: "مشروب غازي", unitPrice: 10, quantity: 1 },
        ],
      }),
    })
    const invoice = (await created.json()) as Record<string, unknown>

    expect(created.status).toBe(201)
    expect(invoice).toMatchObject({
      subtotalAmount: 40,
      discountAmount: 8,
      taxAmount: 1.2,
      totalAmount: 33.2,
    })
  })

  it("still charges 0% on every line when auto-apply tax is off, even for a standard-rated product", async () => {
    const { token, actor } = await signIn("tax-override-autoapply@example.com", "Tax Override Auto")
    await fetch(`${baseUrl}/v1/tax-rates`, { headers: authHeaders(token) })
    const soda = await createProduct(token, {
      name: "مشروب غازي",
      sku: "SKU-SODA-3",
      sellPrice: 10,
    })

    // Direct SQL, not PATCH /v1/organizations/:id -- see tax-rates.http.test.ts for why (the
    // route runs through this container's separate "memory" mode repositories).
    await database.query(`UPDATE organizations SET settings = $2 WHERE id = $1`, [
      actor.organizationId,
      JSON.stringify({ taxAutoApplyToProducts: false }),
    ])
    await fetch(`${baseUrl}/v1/pos/payment-methods/cash`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
    })

    const created = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        customerName: null,
        customerPhone: null,
        customerId: null,
        payments: [{ paymentMethodCode: "cash", amount: 10 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: soda.body.id, productName: "مشروب غازي", unitPrice: 10, quantity: 1 }],
      }),
    })
    const invoice = (await created.json()) as Record<string, unknown>

    expect(created.status).toBe(201)
    expect(invoice).toMatchObject({ taxAmount: 0, totalAmount: 10 })
  })
})
