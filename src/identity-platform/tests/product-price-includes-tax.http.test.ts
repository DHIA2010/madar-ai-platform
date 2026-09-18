// @vitest-environment node
//
// Covers a native product's own price_includes_tax flag (migration 070) and its real effect on
// POST /v1/pos/invoices -- a gross-priced (tax-inclusive) product's stored sell_price already
// contains VAT, so invoices-service.ts's create() must split it into net/tax instead of adding
// tax on top of it. Also covers POST /v1/products/apply-tax-convention, the bulk conversion
// behind Settings -> الضرائب -> "الأسعار تشمل الضريبة" -> "جميع المنتجات الحالية".

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
      fullName: "Price Includes Tax Test",
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
     values ($1, $2, 'hash', 'Price Includes Tax Test', now()) on conflict (id) do nothing`,
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

async function enableCash(token: string) {
  await fetch(`${baseUrl}/v1/pos/payment-methods/cash`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
  })
}

async function seedDefaultRate(token: string) {
  // GET /v1/tax-rates lazily seeds the real 15% default the first time it's read.
  await fetch(`${baseUrl}/v1/tax-rates`, { headers: authHeaders(token) })
}

describe("product price_includes_tax (gross/net pricing)", () => {
  it("creates a product with priceIncludesTax and returns it", async () => {
    const { token } = await signIn("pit-create@example.com", "PIT Create")
    const created = await createProduct(token, {
      name: "قهوة",
      sku: "SKU-COFFEE",
      sellPrice: 11.5,
      priceIncludesTax: true,
    })

    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ priceIncludesTax: true })

    const fetched = await fetch(`${baseUrl}/v1/products/${created.body.id}`, {
      headers: authHeaders(token),
    })
    expect(await fetched.json()).toMatchObject({ priceIncludesTax: true, sellPrice: 11.5 })
  })

  it("splits a gross (tax-inclusive) price's own line into net + tax instead of adding tax on top", async () => {
    const { token } = await signIn("pit-gross@example.com", "PIT Gross")
    await seedDefaultRate(token)
    await enableCash(token)

    // 11.50 at 15% VAT is exactly 10.00 net + 1.50 tax -- the customer is charged 11.50, not
    // 11.50 + 15% = 13.225, which is what a naive net-price treatment would wrongly charge.
    const coffee = await createProduct(token, {
      name: "قهوة",
      sku: "SKU-COFFEE-2",
      sellPrice: 11.5,
      priceIncludesTax: true,
    })

    const created = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        customerName: null,
        customerPhone: null,
        customerId: null,
        payments: [{ paymentMethodCode: "cash", amount: 11.5 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: coffee.body.id, productName: "قهوة", unitPrice: 11.5, quantity: 1 }],
      }),
    })
    const invoice = (await created.json()) as Record<string, unknown>

    expect(created.status).toBe(201)
    expect(invoice).toMatchObject({ subtotalAmount: 10, taxAmount: 1.5, totalAmount: 11.5 })
  })

  it("mixes a gross-priced product and a net-priced product correctly in the same cart", async () => {
    const { token } = await signIn("pit-mixed@example.com", "PIT Mixed")
    await seedDefaultRate(token)
    await enableCash(token)

    // Coffee: gross 11.50 -> net 10.00 + tax 1.50. Water: net 10.00 -> tax 1.50, gross 11.50.
    // Combined: subtotal (net) 20.00, tax 3.00, total 23.00.
    const coffee = await createProduct(token, {
      name: "قهوة",
      sku: "SKU-COFFEE-3",
      sellPrice: 11.5,
      priceIncludesTax: true,
    })
    const water = await createProduct(token, {
      name: "مياه",
      sku: "SKU-WATER",
      sellPrice: 10,
      priceIncludesTax: false,
    })

    const created = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        customerName: null,
        customerPhone: null,
        customerId: null,
        payments: [{ paymentMethodCode: "cash", amount: 23 }],
        discountAmount: 0,
        notes: null,
        items: [
          { productId: coffee.body.id, productName: "قهوة", unitPrice: 11.5, quantity: 1 },
          { productId: water.body.id, productName: "مياه", unitPrice: 10, quantity: 1 },
        ],
      }),
    })
    const invoice = (await created.json()) as Record<string, unknown>

    expect(created.status).toBe(201)
    expect(invoice).toMatchObject({ subtotalAmount: 20, taxAmount: 3, totalAmount: 23 })
  })

  it("applies the tax convention to every existing priced product and preserves the real charged total", async () => {
    const { token } = await signIn("pit-bulk-all@example.com", "PIT Bulk All")
    await seedDefaultRate(token)
    await enableCash(token)

    // Net-priced today: sells for 100 + 15% = 115 total.
    const tea = await createProduct(token, {
      name: "شاي",
      sku: "SKU-TEA",
      sellPrice: 100,
      priceIncludesTax: false,
    })

    const convert = await fetch(`${baseUrl}/v1/products/apply-tax-convention`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ includeTax: true }),
    })
    expect(convert.status).toBe(200)
    expect(await convert.json()).toMatchObject({ updated: 1 })

    const fetched = (await (
      await fetch(`${baseUrl}/v1/products/${tea.body.id}`, { headers: authHeaders(token) })
    ).json()) as Record<string, unknown>
    // Same real shelf price, now expressed gross: 100 * 1.15 = 115, flagged tax-inclusive.
    expect(fetched).toMatchObject({ sellPrice: 115, priceIncludesTax: true })

    // Selling at the new (converted) price still charges the same real total as before.
    const created = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        customerName: null,
        customerPhone: null,
        customerId: null,
        payments: [{ paymentMethodCode: "cash", amount: 115 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: tea.body.id, productName: "شاي", unitPrice: 115, quantity: 1 }],
      }),
    })
    const invoice = (await created.json()) as Record<string, unknown>
    expect(created.status).toBe(201)
    expect(invoice).toMatchObject({ subtotalAmount: 100, taxAmount: 15, totalAmount: 115 })
  })

  it("converting back to tax-exclusive restores the original net price and skips products already on the target convention", async () => {
    const { token } = await signIn("pit-bulk-back@example.com", "PIT Bulk Back")
    await seedDefaultRate(token)

    const juice = await createProduct(token, {
      name: "عصير",
      sku: "SKU-JUICE",
      sellPrice: 115,
      priceIncludesTax: true,
    })
    // Already tax-exclusive -- must be left untouched by an includeTax:false conversion.
    const alreadyNet = await createProduct(token, {
      name: "بسكويت",
      sku: "SKU-COOKIE",
      sellPrice: 50,
      priceIncludesTax: false,
    })

    const convert = await fetch(`${baseUrl}/v1/products/apply-tax-convention`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ includeTax: false }),
    })
    expect(convert.status).toBe(200)
    expect(await convert.json()).toMatchObject({ updated: 1 })

    const fetchedJuice = (await (
      await fetch(`${baseUrl}/v1/products/${juice.body.id}`, { headers: authHeaders(token) })
    ).json()) as Record<string, unknown>
    expect(fetchedJuice).toMatchObject({ sellPrice: 100, priceIncludesTax: false })

    const fetchedCookie = (await (
      await fetch(`${baseUrl}/v1/products/${alreadyNet.body.id}`, { headers: authHeaders(token) })
    ).json()) as Record<string, unknown>
    expect(fetchedCookie).toMatchObject({ sellPrice: 50, priceIncludesTax: false })
  })
})
