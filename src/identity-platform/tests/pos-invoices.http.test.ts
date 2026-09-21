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

async function enablePaymentMethod(token: string, code: string) {
  await fetch(`${baseUrl}/v1/pos/payment-methods/${code}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ enabled: true, feePercent: 0, merchantId: null, apiKey: null }),
  })
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

async function createReturn(
  token: string,
  invoiceId: string,
  items: Array<{ invoiceItemId: string; quantity: number }>,
  notes: string | null = null,
  paymentMethodCode = "cash"
) {
  const response = await fetch(`${baseUrl}/v1/pos/invoices/${invoiceId}/returns`, {
    method: "POST",
    headers: authHeaders(token),
    // Single line, no amount -- the backend infers it as the return's own full computed total.
    body: JSON.stringify({ items, payments: [{ paymentMethodCode }], notes }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function listReturns(token: string, query = "") {
  const response = await fetch(`${baseUrl}/v1/pos/invoices/returns${query}`, {
    headers: authHeaders(token),
  })
  return {
    status: response.status,
    body: (await response.json()) as { items: Array<Record<string, unknown>> },
  }
}

async function createProduct(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/products`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      productType: "simple",
      category: "عام",
      description: "",
      status: "active",
      costPrice: null,
      minStock: 0,
      baseUnit: null,
      taxRateId: null,
      priceIncludesTax: false,
      ...body,
    }),
  })
  return (await response.json()) as { id: string }
}

// Subtotal 32 (24 + 8), no discount, 15% VAT -> tax 4.80, total 36.80.
const COFFEE_SALE = {
  customerName: null,
  payments: [{ paymentMethodCode: "cash", amount: 36.8 }],
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
    expect(created.body).toMatchObject({
      status: "completed",
      customerName: null,
      customerId: null,
      paymentMethodCode: "cash",
      payments: [{ paymentMethodCode: "cash", amount: 36.8 }],
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

    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      discountAmount: 8,
      payments: [{ paymentMethodCode: "cash", amount: 27.6 }],
    })

    // Subtotal 32, discount 8 -> taxable 24, VAT 3.60, total 27.60 -- matches the reference
    // invoice's own numbers (34 subtotal, 8 discount, 3.90 tax on a slightly different cart).
    expect(created.body).toMatchObject({
      subtotalAmount: 32,
      discountAmount: 8,
      taxAmount: 3.6,
      totalAmount: 27.6,
    })
  })

  it("applies a per-item discount, reporting the combined total as the invoice's discountAmount", async () => {
    const { token } = await signIn("invoice-item-discount@example.com", "Invoice Item Discount")

    // Subtotal 32 (24 + 8), a 3 SAR discount on just the coffee line, no order-wide discount ->
    // taxable 29, VAT 4.35, total 33.35. subtotalAmount stays the raw pre-discount 32, and
    // discountAmount (order 0 + item 3) is what actually brings it down to the real taxable base.
    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      payments: [{ paymentMethodCode: "cash", amount: 33.35 }],
      items: [
        {
          productId: null,
          productName: "قهوة مختصة",
          unitPrice: 12,
          quantity: 2,
          discountAmount: 3,
        },
        { productId: null, productName: "كرواسون", unitPrice: 8, quantity: 1 },
      ],
    })

    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      subtotalAmount: 32,
      discountAmount: 3,
      taxAmount: 4.35,
      totalAmount: 33.35,
    })
    expect(created.body.items).toMatchObject([
      { productName: "قهوة مختصة", lineTotal: 24, discountAmount: 3 },
      { productName: "كرواسون", lineTotal: 8, discountAmount: 0 },
    ])
  })

  it("stacks a per-item discount with the order-wide discount on the same sale", async () => {
    const { token } = await signIn(
      "invoice-stacked-discount@example.com",
      "Invoice Stacked Discount"
    )

    // Item discount 3 on the coffee line first (net 24 -> 21, net 32 -> 29 overall), then the
    // order-wide 4 SAR discount spread across what's left by share -> taxable 25, VAT 3.75,
    // total 28.75. discountAmount is the sum of both: 4 + 3 = 7.
    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      discountAmount: 4,
      payments: [{ paymentMethodCode: "cash", amount: 28.75 }],
      items: [
        {
          productId: null,
          productName: "قهوة مختصة",
          unitPrice: 12,
          quantity: 2,
          discountAmount: 3,
        },
        { productId: null, productName: "كرواسون", unitPrice: 8, quantity: 1 },
      ],
    })

    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      subtotalAmount: 32,
      discountAmount: 7,
      taxAmount: 3.75,
      totalAmount: 28.75,
    })
  })

  it("clamps a per-item discount so it can never exceed what that one line is worth", async () => {
    const { token } = await signIn(
      "invoice-clamped-discount@example.com",
      "Invoice Clamped Discount"
    )

    // A 100 SAR "discount" on a 24 SAR line is clamped to 24 -- that line's taxable drops to 0,
    // not negative, and the invoice's own discountAmount reflects the real 24 actually applied,
    // not the 100 that was sent.
    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      payments: [{ paymentMethodCode: "cash", amount: 9.2 }],
      items: [
        {
          productId: null,
          productName: "قهوة مختصة",
          unitPrice: 12,
          quantity: 2,
          discountAmount: 100,
        },
        { productId: null, productName: "كرواسون", unitPrice: 8, quantity: 1 },
      ],
    })

    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      subtotalAmount: 32,
      discountAmount: 24,
      taxAmount: 1.2,
      totalAmount: 9.2,
    })
    expect(created.body.items).toMatchObject([
      { productName: "قهوة مختصة", discountAmount: 24 },
      { productName: "كرواسون", discountAmount: 0 },
    ])
  })

  it("splits a sale across more than one payment method", async () => {
    const { token } = await signIn("invoice-split@example.com", "Invoice Split")
    await enablePaymentMethod(token, "mada")

    // Total is 36.80 -- 20 cash, 16.80 mada.
    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      payments: [
        { paymentMethodCode: "cash", amount: 20 },
        { paymentMethodCode: "mada", amount: 16.8 },
      ],
    })

    expect(created.status).toBe(201)
    expect(created.body.paymentMethodCode).toBe("split")
    expect(created.body.payments).toEqual(
      expect.arrayContaining([
        { paymentMethodCode: "cash", amount: 20 },
        { paymentMethodCode: "mada", amount: 16.8 },
      ])
    )
    expect(created.body.totalAmount).toBe(36.8)
  })

  it("rejects payment lines that don't add up to the total", async () => {
    const { token } = await signIn("invoice-mismatch@example.com", "Invoice Mismatch")

    const short = await createInvoice(token, {
      ...COFFEE_SALE,
      payments: [{ paymentMethodCode: "cash", amount: 10 }],
    })
    expect(short.status).toBe(400)
    expect(short.body).toMatchObject({ code: "POS_INVOICE_PAYMENT_AMOUNT_MISMATCH" })
  })

  it("defers part of a sale to a real customer's account and grows their balance", async () => {
    const { token } = await signIn("invoice-deferred@example.com", "Invoice Deferred")
    await enablePaymentMethod(token, "customer_credit")

    const customerResponse = await fetch(`${baseUrl}/v1/customers`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name: "أحمد", email: null, phone: null, notes: null }),
    })
    const customer = (await customerResponse.json()) as { id: string }

    // Total 36.80 -- 20 cash now, 16.80 deferred to the customer's account.
    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      customerId: customer.id,
      payments: [
        { paymentMethodCode: "cash", amount: 20 },
        { paymentMethodCode: "customer_credit", amount: 16.8 },
      ],
    })
    expect(created.status).toBe(201)
    expect(created.body.customerId).toBe(customer.id)

    const detailResponse = await fetch(`${baseUrl}/v1/customers/${customer.id}`, {
      headers: authHeaders(token),
    })
    const detail = (await detailResponse.json()) as { accountBalance: number }
    expect(detail.accountBalance).toBe(-16.8)
  })

  it("rejects a deferred amount with no real customer attached", async () => {
    const { token } = await signIn("invoice-deferred-noone@example.com", "Invoice Deferred Noone")
    await enablePaymentMethod(token, "customer_credit")

    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      payments: [{ paymentMethodCode: "customer_credit", amount: 36.8 }],
    })
    expect(created.status).toBe(400)
    expect(created.body).toMatchObject({ code: "POS_INVOICE_DEFERRED_REQUIRES_CUSTOMER" })
  })

  it("spends down a real customer wallet balance topped up beforehand", async () => {
    const { token } = await signIn("invoice-wallet@example.com", "Invoice Wallet")
    await enablePaymentMethod(token, "customer_wallet")

    const customerResponse = await fetch(`${baseUrl}/v1/customers`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name: "منى", email: null, phone: null, notes: null }),
    })
    const customer = (await customerResponse.json()) as { id: string }

    const receiptResponse = await fetch(`${baseUrl}/v1/customers/${customer.id}/receipt-vouchers`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ amount: 100, paymentMethodCode: "cash" }),
    })
    expect(receiptResponse.status).toBe(201)
    const receipted = (await receiptResponse.json()) as { accountBalance: number }
    expect(receipted.accountBalance).toBe(100)

    // Total 36.80, all spent from the wallet.
    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      customerId: customer.id,
      payments: [{ paymentMethodCode: "customer_wallet", amount: 36.8 }],
    })
    expect(created.status).toBe(201)

    const detailResponse = await fetch(`${baseUrl}/v1/customers/${customer.id}`, {
      headers: authHeaders(token),
    })
    const detail = (await detailResponse.json()) as { accountBalance: number }
    expect(detail.accountBalance).toBe(63.2)
  })

  it("rejects a wallet payment larger than the customer's real balance", async () => {
    const { token } = await signIn("invoice-wallet-short@example.com", "Invoice Wallet Short")
    await enablePaymentMethod(token, "customer_wallet")

    const customerResponse = await fetch(`${baseUrl}/v1/customers`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name: "سعيد", email: null, phone: null, notes: null }),
    })
    const customer = (await customerResponse.json()) as { id: string }
    // Wallet starts at 0 -- never topped up.

    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      customerId: customer.id,
      payments: [{ paymentMethodCode: "customer_wallet", amount: 36.8 }],
    })
    expect(created.status).toBe(400)
    expect(created.body).toMatchObject({ code: "POS_INVOICE_INSUFFICIENT_WALLET_BALANCE" })
  })

  it("rejects a wallet payment with no real customer attached", async () => {
    const { token } = await signIn("invoice-wallet-noone@example.com", "Invoice Wallet Noone")
    await enablePaymentMethod(token, "customer_wallet")

    const created = await createInvoice(token, {
      ...COFFEE_SALE,
      payments: [{ paymentMethodCode: "customer_wallet", amount: 36.8 }],
    })
    expect(created.status).toBe(400)
    expect(created.body).toMatchObject({ code: "POS_INVOICE_WALLET_REQUIRES_CUSTOMER" })
  })

  it("rejects an invoice with no items", async () => {
    const { token } = await signIn("invoice-empty@example.com", "Invoice Empty")

    const created = await createInvoice(token, { ...COFFEE_SALE, items: [] })
    expect(created.status).toBe(400)
    expect(created.body).toMatchObject({ code: "VALIDATION_ERROR" })
  })

  it("cancels an invoice", async () => {
    const { token } = await signIn("invoice-status@example.com", "Invoice Status")

    const created = await createInvoice(token, COFFEE_SALE)
    const cancelled = await setStatus(token, String(created.body.id), "cancelled")
    expect(cancelled.status).toBe(200)
    expect(cancelled.body).toMatchObject({ status: "cancelled" })
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
      payments: [{ paymentMethodCode: "bank_transfer", amount: 36.8 }],
    })
    expect(disabled.status).toBe(400)
    expect(disabled.body).toMatchObject({ code: "POS_INVOICE_INVALID_PAYMENT_METHOD" })

    const unknown = await createInvoice(token, {
      ...COFFEE_SALE,
      payments: [{ paymentMethodCode: "not_a_real_method", amount: 36.8 }],
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

  it("rejects re-finalizing an invoice that already left completed", async () => {
    const { token } = await signIn("invoice-immutable@example.com", "Invoice Immutable")

    const created = await createInvoice(token, COFFEE_SALE)
    expect((await setStatus(token, String(created.body.id), "cancelled")).status).toBe(200)

    const secondCancel = await setStatus(token, String(created.body.id), "cancelled")
    expect(secondCancel.status).toBe(409)
    expect(secondCancel.body).toMatchObject({ code: "POS_INVOICE_ALREADY_FINALIZED" })

    const items = created.body.items as Array<{ id: string }>
    const returnAfterCancel = await createReturn(token, String(created.body.id), [
      { invoiceItemId: items[0].id, quantity: 1 },
    ])
    expect(returnAfterCancel.status).toBe(409)
    expect(returnAfterCancel.body).toMatchObject({ code: "POS_INVOICE_NOT_RETURNABLE" })
  })

  it("returns part of one line, crediting the customer and restoring real stock", async () => {
    const { token } = await signIn("invoice-partial-return@example.com", "Invoice Partial Return")
    // The refund itself is settled as real store credit -- createReturn() only credits
    // account_balance when the CHOSEN REFUND method is a credit/prepaid kind, so this test's
    // returns are explicitly refunded through "customer_credit" rather than the default "cash".
    await enablePaymentMethod(token, "customer_credit")

    const customer = (await (
      await fetch(`${baseUrl}/v1/customers`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ name: "سارة", email: null, phone: null, notes: null }),
      })
    ).json()) as { id: string }

    const product = await createProduct(token, {
      name: "كوب قهوة",
      sku: "RETURN-CUP-1",
      stockQuantity: 10,
      sellPrice: 12,
    })

    // 3 units at 12 (net, 15% VAT) -> subtotal 36, tax 5.40, total 41.40.
    const created = await createInvoice(token, {
      customerName: null,
      customerId: customer.id,
      payments: [{ paymentMethodCode: "cash", amount: 41.4 }],
      discountAmount: 0,
      items: [{ productId: product.id, productName: "كوب قهوة", unitPrice: 12, quantity: 3 }],
    })
    expect(created.status).toBe(201)
    const line = (created.body.items as Array<{ id: string; quantity: number }>)[0]
    expect(line.quantity).toBe(3)

    // Return 1 of the 3 cups -- exactly a third: 12 net, 1.80 tax, 13.80 total.
    const returned = await createReturn(
      token,
      String(created.body.id),
      [{ invoiceItemId: line.id, quantity: 1 }],
      null,
      "customer_credit"
    )
    expect(returned.status).toBe(201)
    expect(returned.body).toMatchObject({
      invoiceNumber: created.body.invoiceNumber,
      subtotalAmount: 12,
      discountAmount: 0,
      taxAmount: 1.8,
      totalAmount: 13.8,
    })
    expect(returned.body.returnNumber).toMatch(/^RTN-\d{6}$/)

    // The invoice itself is now "partially_returned", not "returned" -- 2 of the 3 cups are
    // still with the customer.
    const invoiceAfter = await listInvoices(token, `?search=${created.body.invoiceNumber}`)
    expect(invoiceAfter.body.items[0]).toMatchObject({ status: "partially_returned" })

    // Real store credit landed on the customer's account for exactly the returned amount.
    const customerDetail = (await (
      await fetch(`${baseUrl}/v1/customers/${customer.id}`, { headers: authHeaders(token) })
    ).json()) as { accountBalance: number }
    expect(customerDetail.accountBalance).toBe(13.8)

    // The sale itself took the stock down to 10 - 3 = 7; this one-unit return gives back exactly
    // what it took, landing at 8.
    const productDetail = (await (
      await fetch(`${baseUrl}/v1/products/${product.id}`, { headers: authHeaders(token) })
    ).json()) as { stockQuantity: number }
    expect(productDetail.stockQuantity).toBe(8)

    // Returning the other 2 finishes the job -- the invoice is now fully "returned".
    const secondReturn = await createReturn(
      token,
      String(created.body.id),
      [{ invoiceItemId: line.id, quantity: 2 }],
      null,
      "customer_credit"
    )
    expect(secondReturn.status).toBe(201)
    const invoiceAfterSecond = await listInvoices(token, `?search=${created.body.invoiceNumber}`)
    expect(invoiceAfterSecond.body.items[0]).toMatchObject({ status: "returned" })

    // Every unit sold is now back -- stock is exactly what it started at.
    const productDetailFinal = (await (
      await fetch(`${baseUrl}/v1/products/${product.id}`, { headers: authHeaders(token) })
    ).json()) as { stockQuantity: number }
    expect(productDetailFinal.stockQuantity).toBe(10)

    // Both return events show up on the real returns list, each its own document.
    const returns = await listReturns(token)
    expect(returns.body.items).toHaveLength(2)
  })

  it("rejects returning more than what is actually left on a line", async () => {
    const { token } = await signIn("invoice-over-return@example.com", "Invoice Over Return")

    const created = await createInvoice(token, COFFEE_SALE)
    const line = (created.body.items as Array<{ id: string; quantity: number }>)[0]

    const tooMany = await createReturn(token, String(created.body.id), [
      { invoiceItemId: line.id, quantity: 99 },
    ])
    expect(tooMany.status).toBe(400)
    expect(tooMany.body).toMatchObject({ code: "POS_INVOICE_RETURN_QUANTITY_EXCEEDS_REMAINING" })

    // Return the real quantity once, then trying to return any more of the same line fails too.
    expect(
      (
        await createReturn(token, String(created.body.id), [
          { invoiceItemId: line.id, quantity: line.quantity },
        ])
      ).status
    ).toBe(201)
    const overAfterFull = await createReturn(token, String(created.body.id), [
      { invoiceItemId: line.id, quantity: 1 },
    ])
    expect(overAfterFull.status).toBe(400)
    expect(overAfterFull.body).toMatchObject({
      code: "POS_INVOICE_RETURN_QUANTITY_EXCEEDS_REMAINING",
    })
  })

  it("numbers invoices sequentially per workspace with no gaps", async () => {
    const { token } = await signIn("invoice-numbering@example.com", "Invoice Numbering")

    const first = await createInvoice(token, COFFEE_SALE)
    const second = await createInvoice(token, COFFEE_SALE)
    expect(first.body.invoiceNumber).toBe("INV-000001")
    expect(second.body.invoiceNumber).toBe("INV-000002")
  })

  it("still generates a real QR with an empty VAT tag when the organization has no tax profile set", async () => {
    const { token } = await signIn("invoice-no-tax@example.com", "Invoice No Tax")

    const created = await createInvoice(token, COFFEE_SALE)
    expect(created.status).toBe(201)
    expect(created.body.sellerVatNumber).toBeNull()
    expect(typeof created.body.qrCode).toBe("string")

    // Decode the TLV payload: tag 1 (seller name) is real, tag 2 (VAT number) is present but
    // empty -- never blocked on, never fabricated.
    const buffer = Buffer.from(created.body.qrCode as string, "base64")
    let offset = 0
    const tags: Record<number, string> = {}
    while (offset < buffer.length) {
      const tag = buffer[offset]
      const length = buffer[offset + 1]
      tags[tag] = buffer.subarray(offset + 2, offset + 2 + length).toString("utf8")
      offset += 2 + length
    }
    expect(tags[1].length).toBeGreaterThan(0)
    expect(tags[2]).toBe("")
  })

  it("snapshots the seller's tax profile onto the invoice and generates a real ZATCA QR", async () => {
    const { token, actor } = await signIn("invoice-tax@example.com", "Invoice Tax Co")

    await database.query(`UPDATE organizations SET settings = $2 WHERE id = $1`, [
      actor.organizationId,
      JSON.stringify({
        storeName: "مطعم الاختبار",
        taxNumber: "300000000000003",
        addressShort: "الرياض 1234 5678",
      }),
    ])

    const created = await createInvoice(token, COFFEE_SALE)
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      sellerName: "مطعم الاختبار",
      sellerVatNumber: "300000000000003",
      sellerAddress: "الرياض 1234 5678",
    })
    expect(typeof created.body.qrCode).toBe("string")
    expect((created.body.qrCode as string).length).toBeGreaterThan(0)

    // Editing the org's tax profile afterwards must never rewrite an already-issued invoice's
    // snapshot -- only the NEXT invoice reflects the change.
    await database.query(`UPDATE organizations SET settings = $2 WHERE id = $1`, [
      actor.organizationId,
      JSON.stringify({ storeName: "اسم جديد", taxNumber: "300000000000003" }),
    ])
    const reread = await listInvoices(token)
    expect(reread.body.items[0]).toMatchObject({ sellerName: "مطعم الاختبار" })
  })

  it("decrements a simple product's stock on sale, and allows it to go negative", async () => {
    const { token } = await signIn("invoice-stock-simple@example.com", "Invoice Stock Simple")

    const product = await createProduct(token, {
      name: "كيس أرز",
      sku: "STOCK-SIMPLE-1",
      stockQuantity: 5,
      sellPrice: 20,
    })

    const firstSale = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 20 * 3 * 1.15 }],
      discountAmount: 0,
      items: [{ productId: product.id, productName: "كيس أرز", unitPrice: 20, quantity: 3 }],
    })
    expect(firstSale.status).toBe(201)

    const afterFirstSale = (await (
      await fetch(`${baseUrl}/v1/products/${product.id}`, { headers: authHeaders(token) })
    ).json()) as { stockQuantity: number }
    expect(afterFirstSale.stockQuantity).toBe(2)

    // Only 2 left, but selling 5 more still succeeds -- checkout is never blocked by stock, so
    // the count is left to go negative rather than the sale being rejected.
    const secondSale = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 20 * 5 * 1.15 }],
      discountAmount: 0,
      items: [{ productId: product.id, productName: "كيس أرز", unitPrice: 20, quantity: 5 }],
    })
    expect(secondSale.status).toBe(201)

    const afterSecondSale = (await (
      await fetch(`${baseUrl}/v1/products/${product.id}`, { headers: authHeaders(token) })
    ).json()) as { stockQuantity: number }
    expect(afterSecondSale.stockQuantity).toBe(-3)
  })

  const VALID_POS_SETTINGS_BODY = {
    allowBelowCostSale: true,
    allowOutOfStockSale: true,
    confirmSale: false,
    autoOpenCashDrawer: false,
    allowManualPriceEdit: true,
    applyDiscounts: true,
    defaultPrinterDeviceId: null,
    paperWidth: "80mm" as const,
    autoPrintInvoice: true,
    printKitchenCopy: false,
    copiesCount: 1,
    showQuickPaymentScreen: false,
    allowSplitPayment: true,
    rememberLastPaymentMethod: false,
    requirePaymentMethodSelection: true,
    showProductImages: true,
    useCompactMode: false,
    showCategoryPanel: true,
    showGridView: true,
    showListView: true,
    enableBarcodeScanner: true,
    playScanSound: false,
  }

  async function savePosSettings(token: string, overrides: Record<string, unknown>) {
    return fetch(`${baseUrl}/v1/pos/settings`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ ...VALID_POS_SETTINGS_BODY, ...overrides }),
    })
  }

  it("allows a below-cost sale by default, and blocks it once allowBelowCostSale is turned off", async () => {
    const { token } = await signIn("invoice-below-cost@example.com", "Invoice Below Cost")

    const product = await createProduct(token, {
      name: "سماعة بلوتوث",
      sku: "BELOW-COST-1",
      stockQuantity: 10,
      sellPrice: 20,
      costPrice: 25,
    })

    const soldAtLoss = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 20 * 1.15 }],
      discountAmount: 0,
      items: [{ productId: product.id, productName: "سماعة بلوتوث", unitPrice: 20, quantity: 1 }],
    })
    expect(soldAtLoss.status).toBe(201)

    const settingsResponse = await savePosSettings(token, { allowBelowCostSale: false })
    expect(settingsResponse.status).toBe(200)

    const blocked = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 20 * 1.15 }],
      discountAmount: 0,
      items: [{ productId: product.id, productName: "سماعة بلوتوث", unitPrice: 20, quantity: 1 }],
    })
    expect(blocked.status).toBe(422)
    expect((blocked.body as { code: string }).code).toBe("POS_INVOICE_BELOW_COST_SALE_NOT_ALLOWED")

    // Selling at or above cost is still fine even with the setting off.
    const soldAtCost = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 25 * 1.15 }],
      discountAmount: 0,
      items: [{ productId: product.id, productName: "سماعة بلوتوث", unitPrice: 25, quantity: 1 }],
    })
    expect(soldAtCost.status).toBe(201)
  })

  it("allows an out-of-stock sale by default, and blocks it once allowOutOfStockSale is turned off", async () => {
    const { token } = await signIn("invoice-out-of-stock@example.com", "Invoice Out Of Stock")

    const product = await createProduct(token, {
      name: "علبة شاي",
      sku: "OUT-OF-STOCK-1",
      stockQuantity: 2,
      sellPrice: 10,
    })

    const settingsResponse = await savePosSettings(token, { allowOutOfStockSale: false })
    expect(settingsResponse.status).toBe(200)

    // Exactly enough stock -- still allowed.
    const exactSale = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 10 * 2 * 1.15 }],
      discountAmount: 0,
      items: [{ productId: product.id, productName: "علبة شاي", unitPrice: 10, quantity: 2 }],
    })
    expect(exactSale.status).toBe(201)

    // Now at 0 -- selling one more must be rejected instead of going negative.
    const blocked = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 10 * 1.15 }],
      discountAmount: 0,
      items: [{ productId: product.id, productName: "علبة شاي", unitPrice: 10, quantity: 1 }],
    })
    expect(blocked.status).toBe(409)
    expect((blocked.body as { code: string }).code).toBe(
      "POS_INVOICE_OUT_OF_STOCK_SALE_NOT_ALLOWED"
    )

    const afterBlocked = (await (
      await fetch(`${baseUrl}/v1/products/${product.id}`, { headers: authHeaders(token) })
    ).json()) as { stockQuantity: number }
    expect(afterBlocked.stockQuantity).toBe(0)
  })

  it("persists POS settings and returns the platform's original unconditional defaults before anything is saved", async () => {
    const { token } = await signIn("invoice-pos-settings@example.com", "Invoice Pos Settings")

    const defaultsResponse = await fetch(`${baseUrl}/v1/pos/settings`, {
      headers: authHeaders(token),
    })
    expect(defaultsResponse.status).toBe(200)
    const defaults = (await defaultsResponse.json()) as Record<string, unknown>
    expect(defaults.allowBelowCostSale).toBe(true)
    expect(defaults.allowOutOfStockSale).toBe(true)
    expect(defaults.confirmSale).toBe(false)
    expect(defaults.allowSplitPayment).toBe(true)
    expect(defaults.autoPrintInvoice).toBe(true)

    const saveResponse = await savePosSettings(token, {
      confirmSale: true,
      useCompactMode: true,
      copiesCount: 3,
    })
    expect(saveResponse.status).toBe(200)
    const saved = (await saveResponse.json()) as Record<string, unknown>
    expect(saved.confirmSale).toBe(true)
    expect(saved.useCompactMode).toBe(true)
    expect(saved.copiesCount).toBe(3)

    const refetched = (await (
      await fetch(`${baseUrl}/v1/pos/settings`, { headers: authHeaders(token) })
    ).json()) as Record<string, unknown>
    expect(refetched.confirmSale).toBe(true)
    expect(refetched.copiesCount).toBe(3)
  })

  it("decrements a bundle's own components (by their recipe, unit-converted) on sale, and restores them on return", async () => {
    const { token } = await signIn("invoice-stock-bundle@example.com", "Invoice Stock Bundle")

    // Stock tracked in كجم; the recipe asks for 200 جرام per bundle -- same mass dimension, so
    // this converts by the unit table's own factor ratio (200 / 1000 = 0.2 كجم per bundle).
    const flour = await createProduct(token, {
      productType: "raw",
      name: "دقيق",
      stockQuantity: 10,
    })
    // Stock and recipe both in حبة -- same unit, factor 1, no conversion needed.
    const cheese = await createProduct(token, {
      productType: "raw",
      name: "جبنة",
      stockQuantity: 20,
    })
    const bundle = await createProduct(token, {
      productType: "bundle",
      name: "وجبة كومبو",
      sellPrice: 30,
      components: [
        {
          componentRef: flour.id,
          requiredQuantity: 200,
          requiredUnit: "جرام",
          stockUnit: "كجم",
        },
        {
          componentRef: cheese.id,
          requiredQuantity: 2,
          requiredUnit: "حبة",
          stockUnit: "حبة",
        },
      ],
    })

    const sale = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 30 * 3 * 1.15 }],
      discountAmount: 0,
      items: [{ productId: bundle.id, productName: "وجبة كومبو", unitPrice: 30, quantity: 3 }],
    })
    expect(sale.status).toBe(201)

    // 3 bundles -> flour: 10 - 3*0.2 = 9.4 كجم, cheese: 20 - 3*2 = 14 حبة. The bundle itself
    // never carried its own stock (a bundle's availability is derived from its components).
    const flourAfterSale = (await (
      await fetch(`${baseUrl}/v1/products/${flour.id}`, { headers: authHeaders(token) })
    ).json()) as { stockQuantity: number }
    const cheeseAfterSale = (await (
      await fetch(`${baseUrl}/v1/products/${cheese.id}`, { headers: authHeaders(token) })
    ).json()) as { stockQuantity: number }
    expect(flourAfterSale.stockQuantity).toBe(9.4)
    expect(cheeseAfterSale.stockQuantity).toBe(14)

    const line = (sale.body.items as Array<{ id: string }>)[0]
    const returned = await createReturn(token, String(sale.body.id), [
      { invoiceItemId: line.id, quantity: 1 },
    ])
    expect(returned.status).toBe(201)

    // Returning 1 of the 3 bundles gives back exactly what it took: flour +0.2 -> 9.6, cheese
    // +2 -> 16.
    const flourAfterReturn = (await (
      await fetch(`${baseUrl}/v1/products/${flour.id}`, { headers: authHeaders(token) })
    ).json()) as { stockQuantity: number }
    const cheeseAfterReturn = (await (
      await fetch(`${baseUrl}/v1/products/${cheese.id}`, { headers: authHeaders(token) })
    ).json()) as { stockQuantity: number }
    expect(flourAfterReturn.stockQuantity).toBe(9.6)
    expect(cheeseAfterReturn.stockQuantity).toBe(16)
  })

  it("decrements the exact variant sold (not the parent product, which holds no stock of its own), and restores it on return", async () => {
    const { token } = await signIn("invoice-stock-variant@example.com", "Invoice Stock Variant")

    const product = (await createProduct(token, {
      productType: "variable",
      name: "قميص",
      sku: "SHIRT-VARIANT-1",
      sellPrice: null,
      variantOptions: [{ name: "المقاس", values: ["S", "M"] }],
      variants: [
        { sku: "SHIRT-S", price: 50, stock: 5, optionValues: ["S"] },
        { sku: "SHIRT-M", price: 55, stock: 8, optionValues: ["M"] },
      ],
    })) as { id: string; variants: Array<{ id: string; optionValues: string[]; stock: number }> }
    const variantS = product.variants.find((variant) => variant.optionValues[0] === "S")!
    const variantM = product.variants.find((variant) => variant.optionValues[0] === "M")!

    const sale = await createInvoice(token, {
      customerName: null,
      payments: [{ paymentMethodCode: "cash", amount: 55 * 3 * 1.15 }],
      discountAmount: 0,
      items: [
        {
          productId: product.id,
          variantId: variantM.id,
          productName: "قميص - M",
          unitPrice: 55,
          quantity: 3,
        },
      ],
    })
    expect(sale.status).toBe(201)

    // Only the M variant moves -- S (and the parent product, which never carries stock for a
    // variable type) stay untouched.
    const productAfterSale = (await (
      await fetch(`${baseUrl}/v1/products/${product.id}`, { headers: authHeaders(token) })
    ).json()) as { variants: Array<{ id: string; stock: number }> }
    const sAfterSale = productAfterSale.variants.find((v) => v.id === variantS.id)!
    const mAfterSale = productAfterSale.variants.find((v) => v.id === variantM.id)!
    expect(sAfterSale.stock).toBe(5)
    expect(mAfterSale.stock).toBe(5)

    const line = (sale.body.items as Array<{ id: string }>)[0]
    const returned = await createReturn(token, String(sale.body.id), [
      { invoiceItemId: line.id, quantity: 1 },
    ])
    expect(returned.status).toBe(201)

    const productAfterReturn = (await (
      await fetch(`${baseUrl}/v1/products/${product.id}`, { headers: authHeaders(token) })
    ).json()) as { variants: Array<{ id: string; stock: number }> }
    const mAfterReturn = productAfterReturn.variants.find((v) => v.id === variantM.id)!
    expect(mAfterReturn.stock).toBe(6)
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
