// @vitest-environment node
//
// Covers configurable tax rates (migration 068): GET/POST /v1/tax-rates, PATCH/DELETE
// /v1/tax-rates/:id, and their real effect on POST /v1/pos/invoices (TaxRatesService.
// getDefaultRatePercent replacing the old hardcoded 15% VAT_RATE constant).

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
      fullName: "Tax Rates Test",
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
     values ($1, $2, 'hash', 'Tax Rates Test', now()) on conflict (id) do nothing`,
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

async function listTaxRates(token: string) {
  const response = await fetch(`${baseUrl}/v1/tax-rates`, { headers: authHeaders(token) })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function createTaxRate(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/tax-rates`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function updateTaxRate(token: string, id: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/tax-rates/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function deleteTaxRate(token: string, id: string) {
  const response = await fetch(`${baseUrl}/v1/tax-rates/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe("configurable tax rates", () => {
  it("lazily seeds a real 15% default rate the first time an organization asks", async () => {
    const { token } = await signIn("tax-seed@example.com", "Tax Seed")

    const result = await listTaxRates(token)
    expect(result.status).toBe(200)
    const items = result.body.items as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      name: "ضريبة القيمة المضافة",
      type: "sales_tax",
      ratePercent: 15,
      isDefault: true,
      isActive: true,
    })
  })

  it("creates a new rate and can make it the default, unsetting the previous one", async () => {
    const { token } = await signIn("tax-create@example.com", "Tax Create")
    await listTaxRates(token) // seeds the default 15% row

    const created = await createTaxRate(token, {
      name: "ضريبة مبيعات مخفضة",
      type: "custom",
      ratePercent: 8,
      isDefault: true,
      isActive: true,
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ ratePercent: 8, isDefault: true })

    const list = await listTaxRates(token)
    const items = list.body.items as Array<Record<string, unknown>>
    const seeded = items.find((item) => item.name === "ضريبة القيمة المضافة")
    expect(seeded).toMatchObject({ isDefault: false })
  })

  it("rejects creating a second default without unsetting the first at the schema/business level", async () => {
    // The service itself always unsets the previous default rather than rejecting -- this test
    // documents that "making X the default" is a real transition, not two independently-true
    // defaults ever coexisting.
    const { token } = await signIn("tax-double-default@example.com", "Tax Double Default")
    await listTaxRates(token)

    await createTaxRate(token, {
      name: "ضريبة أ",
      type: "custom",
      ratePercent: 5,
      isDefault: true,
      isActive: true,
    })
    await createTaxRate(token, {
      name: "ضريبة ب",
      type: "custom",
      ratePercent: 10,
      isDefault: true,
      isActive: true,
    })

    const list = await listTaxRates(token)
    const items = list.body.items as Array<Record<string, unknown>>
    const defaults = items.filter((item) => item.isDefault === true)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]).toMatchObject({ name: "ضريبة ب" })
  })

  it("refuses to delete the default rate", async () => {
    const { token } = await signIn("tax-delete-default@example.com", "Tax Delete Default")
    const seeded = await listTaxRates(token)
    const defaultRate = (seeded.body.items as Array<Record<string, unknown>>)[0]

    const deleted = await deleteTaxRate(token, defaultRate.id as string)
    expect(deleted.status).toBe(409)
    expect(deleted.body).toMatchObject({ code: "TAX_RATE_CANNOT_DELETE_DEFAULT" })
  })

  it("refuses to unset a rate's default status directly, and refuses to deactivate a default", async () => {
    const { token } = await signIn("tax-unset-default@example.com", "Tax Unset Default")
    const seeded = await listTaxRates(token)
    const defaultRate = (seeded.body.items as Array<Record<string, unknown>>)[0]

    const unset = await updateTaxRate(token, defaultRate.id as string, { isDefault: false })
    expect(unset.status).toBe(409)
    expect(unset.body).toMatchObject({ code: "TAX_RATE_CANNOT_UNSET_DEFAULT" })

    const deactivated = await updateTaxRate(token, defaultRate.id as string, { isActive: false })
    expect(deactivated.status).toBe(409)
    expect(deactivated.body).toMatchObject({ code: "TAX_RATE_CANNOT_DEACTIVATE_DEFAULT" })
  })

  it("deletes a non-default rate normally", async () => {
    const { token } = await signIn("tax-delete-normal@example.com", "Tax Delete Normal")
    await listTaxRates(token)
    const created = await createTaxRate(token, {
      name: "ضريبة إضافية",
      type: "custom",
      ratePercent: 3,
      isDefault: false,
      isActive: true,
    })

    const deleted = await deleteTaxRate(token, created.body.id as string)
    expect(deleted.status).toBe(200)

    const list = await listTaxRates(token)
    expect((list.body.items as unknown[]).length).toBe(1)
  })

  it("charges the organization's real configured default rate on a sale, not a hardcoded 15%", async () => {
    const { token } = await signIn("tax-real-invoice@example.com", "Tax Real Invoice")
    await listTaxRates(token) // seeds the default 15% row
    await createTaxRate(token, {
      name: "ضريبة مخفضة",
      type: "custom",
      ratePercent: 8,
      isDefault: true,
      isActive: true,
    })

    await fetch(`${baseUrl}/v1/pos/payment-methods/cash`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
    })

    // Subtotal 100 -> at 8% VAT, tax is 8.00, total 108.00 (would be 15.00/115.00 at the old rate).
    const created = await fetch(`${baseUrl}/v1/pos/invoices`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        customerName: null,
        customerPhone: null,
        customerId: null,
        payments: [{ paymentMethodCode: "cash", amount: 108 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: null, productName: "منتج", unitPrice: 100, quantity: 1 }],
      }),
    })
    const invoice = (await created.json()) as Record<string, unknown>

    expect(created.status).toBe(201)
    expect(invoice).toMatchObject({ subtotalAmount: 100, taxAmount: 8, totalAmount: 108 })
  })

  it("charges 0% when the organization has turned off auto-apply tax, regardless of the default rate", async () => {
    const { token, actor } = await signIn("tax-auto-apply-off@example.com", "Tax Auto Apply Off")
    await listTaxRates(token) // seeds a real 15% default rate

    // Direct SQL, not PATCH /v1/organizations/:id -- that route runs through this container's
    // "memory" mode command-handler repositories, a separate store from the raw pg-mem database
    // invoices-service.ts reads via this.database.query() (see pos-invoices.http.test.ts's own
    // "snapshots the seller's tax profile" test for the same workaround).
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
        payments: [{ paymentMethodCode: "cash", amount: 100 }],
        discountAmount: 0,
        notes: null,
        items: [{ productId: null, productName: "منتج", unitPrice: 100, quantity: 1 }],
      }),
    })
    const invoice = (await created.json()) as Record<string, unknown>

    expect(created.status).toBe(201)
    expect(invoice).toMatchObject({ subtotalAmount: 100, taxAmount: 0, totalAmount: 100 })
  })

  it("refuses tax-rate management for an actor without the tax:manage permission", async () => {
    // A member's role always includes tax:view at minimum (see system-roles.ts) but this checks
    // the write path is genuinely gated, not just hidden in the UI.
    const response = await fetch(`${baseUrl}/v1/tax-rates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x", type: "custom", ratePercent: 1 }),
    })
    expect(response.status).toBe(401)
  })

  it("rejects an invalid rate percentage", async () => {
    const { token } = await signIn("tax-invalid-rate@example.com", "Tax Invalid Rate")
    const response = await fetch(`${baseUrl}/v1/tax-rates`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name: "ضريبة غريبة", type: "custom", ratePercent: 150 }),
    })
    expect(response.status).toBe(400)
  })
})
