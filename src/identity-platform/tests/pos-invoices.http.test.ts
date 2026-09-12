// @vitest-environment node
//
// Covers point-of-sale invoices (migration 055): POST /v1/pos/invoices, GET /v1/pos/invoices,
// GET /v1/pos/invoices/summary, and PATCH /v1/pos/invoices/:id/status.

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
      fullName: "Invoice Test",
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
     values ($1, $2, 'hash', 'Invoice Test', now()) on conflict (id) do nothing`,
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

  const token = login.session.accessToken
  // A sale can only use a payment method the branch has actually turned on (see
  // POS_INVOICE_INVALID_PAYMENT_METHOD) -- every catalogue entry defaults to disabled, so "cash"
  // is enabled here for every signed-in actor rather than repeating this in each test.
  await fetch(`${baseUrl}/v1/pos/payment-methods/cash`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
  })

  return { token, actor }
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

async function createInvoice(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/invoices`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function listInvoices(token: string, query = "") {
  const response = await fetch(`${baseUrl}/v1/pos/invoices${query}`, {
    headers: authHeaders(token),
  })
  return {
    status: response.status,
    body: (await response.json()) as { items: Array<Record<string, unknown>> },
  }
}

async function summary(token: string, query = "") {
  const response = await fetch(`${baseUrl}/v1/pos/invoices/summary${query}`, {
    headers: authHeaders(token),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function setStatus(token: string, id: string, status: string) {
  const response = await fetch(`${baseUrl}/v1/pos/invoices/${id}/status`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

const COFFEE_SALE = {
  customerName: null,
  paymentMethodCode: "cash",
  discountAmount: 0,
  items: [
    { productId: null, productName: "قهوة مختصة", unitPrice: 12, quantity: 2 },
    { productId: null, productName: "كرواسون", unitPrice: 8, quantity: 1 },
  ],
}

describe("point-of-sale invoices", () => {
  it("creates an invoice with real VAT computed over the discounted subtotal", async () => {
    const { token } = await signIn("invoice-create@example.com", "Invoice Create")

    const created = await createInvoice(token, COFFEE_SALE)

    expect(created.status).toBe(201)
    // Subtotal 32 (24 + 8), no discount, 15% VAT -> tax 4.80, total 36.80.
    expect(created.body).toMatchObject({
      status: "completed",
      customerName: null,
      paymentMethodCode: "cash",
      subtotalAmount: 32,
      discountAmount: 0,
      taxAmount: 4.8,
      totalAmount: 36.8,
    })
    expect(created.body.invoiceNumber).toMatch(/^INV-\d{6}$/)
    expect(created.body.items).toHaveLength(2)
  })

  it("applies a discount before computing tax", async () => {
    const { token } = await signIn("invoice-discount@example.com", "Invoice Discount")

    const created = await createInvoice(token, { ...COFFEE_SALE, discountAmount: 8 })

    // Subtotal 32, discount 8 -> taxable 24, VAT 3.60, total 27.60 -- matches the reference
    // invoice's own numbers (34 subtotal, 8 discount, 3.90 tax on a slightly different cart).
    expect(created.body).toMatchObject({
      subtotalAmount: 32,
      discountAmount: 8,
      taxAmount: 3.6,
      totalAmount: 27.6,
    })
  })

  it("rejects an invoice with no items", async () => {
    const { token } = await signIn("invoice-empty@example.com", "Invoice Empty")

    const created = await createInvoice(token, { ...COFFEE_SALE, items: [] })
    expect(created.status).toBe(400)
    expect(created.body).toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("cancels and returns an invoice", async () => {
    const { token } = await signIn("invoice-status@example.com", "Invoice Status")

    const created = await createInvoice(token, COFFEE_SALE)
    const cancelled = await setStatus(token, String(created.body.id), "cancelled")
    expect(cancelled.status).toBe(200)
    expect(cancelled.body).toMatchObject({ status: "cancelled" })

    const second = await createInvoice(token, COFFEE_SALE)
    const returned = await setStatus(token, String(second.body.id), "returned")
    expect(returned.body).toMatchObject({ status: "returned" })
  })

  it("lists invoices filtered by status, and summarizes counts and average value", async () => {
    const { token } = await signIn("invoice-summary@example.com", "Invoice Summary")

    const first = await createInvoice(token, COFFEE_SALE) // total 36.80
    const second = await createInvoice(token, COFFEE_SALE) // total 36.80
    await setStatus(token, String(second.body.id), "cancelled")

    const all = await listInvoices(token)
    expect(all.body.items).toHaveLength(2)

    const onlyCompleted = await listInvoices(token, "?status=completed")
    expect(onlyCompleted.body.items).toHaveLength(1)
    expect(onlyCompleted.body.items[0]).toMatchObject({ id: first.body.id })

    const stats = await summary(token)
    expect(stats.body).toMatchObject({
      totalCount: 2,
      completedCount: 1,
      cancelledCount: 1,
      returnedCount: 0,
      // Average and total are over completed invoices only -- the cancelled one must not pull
      // either figure down.
      averageCompletedValue: 36.8,
      totalCompletedAmount: 36.8,
    })
  })

  it("rejects a payment method the branch has not enabled", async () => {
    const { token } = await signIn("invoice-bad-payment@example.com", "Invoice Bad Payment")

    // "bank_transfer" is a real catalogue entry that defaults to disabled and, unlike "cash",
    // signIn() never turns it on.
    const disabled = await createInvoice(token, {
      ...COFFEE_SALE,
      paymentMethodCode: "bank_transfer",
    })
    expect(disabled.status).toBe(400)
    expect(disabled.body).toMatchObject({ code: "POS_INVOICE_INVALID_PAYMENT_METHOD" })

    const unknown = await createInvoice(token, {
      ...COFFEE_SALE,
      paymentMethodCode: "not_a_real_method",
    })
    expect(unknown.status).toBe(400)
    expect(unknown.body).toMatchObject({ code: "POS_INVOICE_INVALID_PAYMENT_METHOD" })
  })

  it("keeps one organization's invoices out of another's", async () => {
    const first = await signIn("invoice-org-a@example.com", "Invoice Org A")
    const second = await signIn("invoice-org-b@example.com", "Invoice Org B")

    await createInvoice(first.token, COFFEE_SALE)

    expect((await listInvoices(second.token)).body.items).toHaveLength(0)
  })

  it("persists a note typed on the cart before checkout", async () => {
    const { token } = await signIn("invoice-notes@example.com", "Invoice Notes")

    const created = await createInvoice(token, { ...COFFEE_SALE, notes: "بدون سكر" })
    expect(created.status).toBe(201)
    expect(created.body.notes).toBe("بدون سكر")

    // A sale with no note recorded reads back null, not an empty string or missing key.
    const withoutNote = await createInvoice(token, COFFEE_SALE)
    expect(withoutNote.body.notes).toBeNull()
  })

  it("refuses an unauthenticated read", async () => {
    expect((await fetch(`${baseUrl}/v1/pos/invoices`)).status).toBe(401)
  })
})

async function holdOrder(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/held-orders`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function listHeldOrders(token: string, workspaceId: string) {
  const response = await fetch(
    `${baseUrl}/v1/pos/held-orders?workspaceId=${encodeURIComponent(workspaceId)}`,
    { headers: authHeaders(token) }
  )
  return {
    status: response.status,
    body: (await response.json()) as { items: Array<Record<string, unknown>> },
  }
}

async function removeHeldOrder(token: string, id: string) {
  const response = await fetch(`${baseUrl}/v1/pos/held-orders/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

const HELD_CART = {
  customerName: "زائر",
  discountAmount: 0,
  notes: "سيعود بعد قليل",
  items: [{ productId: null, productName: "شاي أخضر", unitPrice: 15, quantity: 1 }],
}

describe("point-of-sale held orders", () => {
  it("parks a cart and resumes it exactly as it was held", async () => {
    const { token, actor } = await signIn("held-resume@example.com", "Held Resume")

    const held = await holdOrder(token, { ...HELD_CART, workspaceId: actor.workspaceId })
    expect(held.status).toBe(201)
    expect(held.body).toMatchObject({
      customerName: "زائر",
      notes: "سيعود بعد قليل",
      items: HELD_CART.items,
    })

    expect((await listHeldOrders(token, actor.workspaceId!)).body.items).toHaveLength(1)

    // Resuming reads the parked cart back and consumes it -- it is the one real in-progress
    // cart, not a template that stays behind for reuse.
    const resumed = await removeHeldOrder(token, String(held.body.id))
    expect(resumed.status).toBe(200)
    expect(resumed.body).toMatchObject({ customerName: "زائر", notes: "سيعود بعد قليل" })
    expect((await listHeldOrders(token, actor.workspaceId!)).body.items).toHaveLength(0)
  })

  it("404s resuming an order twice", async () => {
    const { token, actor } = await signIn("held-double@example.com", "Held Double")
    const held = await holdOrder(token, { ...HELD_CART, workspaceId: actor.workspaceId })

    expect((await removeHeldOrder(token, String(held.body.id))).status).toBe(200)
    expect((await removeHeldOrder(token, String(held.body.id))).status).toBe(404)
  })

  it("keeps one organization's held orders out of another's", async () => {
    const first = await signIn("held-org-a@example.com", "Held Org A")
    const second = await signIn("held-org-b@example.com", "Held Org B")

    await holdOrder(first.token, { ...HELD_CART, workspaceId: first.actor.workspaceId })

    expect((await listHeldOrders(second.token, second.actor.workspaceId!)).body.items).toHaveLength(
      0
    )
  })

  it("refuses an unauthenticated hold", async () => {
    const response = await fetch(`${baseUrl}/v1/pos/held-orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...HELD_CART, workspaceId: "00000000-0000-0000-0000-000000000000" }),
    })
    expect(response.status).toBe(401)
  })
})
