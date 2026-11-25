// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the API answers are read loosely here */
//
// Cashier exchanges (استبدال): POST /v1/pos/invoices/:id/exchanges and GET
// /v1/pos/invoices/exchanges -- a credit note for what comes back and a new invoice for what goes
// out, saved together, with only the difference moving as money.

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

async function post(token: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, any> }
}
async function get(token: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`, { headers: authHeaders(token) })
  return (await response.json()) as Record<string, any>
}
async function product(token: string, name: string, sellPrice: number, stockQuantity = 10) {
  return (await post(token, "/v1/products", {
    productType: "simple",
    category: "ملابس",
    description: "",
    status: "active",
    costPrice: null,
    minStock: 0,
    baseUnit: null,
    taxRateId: null,
    priceIncludesTax: false,
    name,
    sku: `${name}-${Math.random().toString(36).slice(2, 8)}`,
    stockQuantity,
    sellPrice,
  }).then((result) => result.body)) as { id: string }
}
const stockOf = async (token: string, id: string) =>
  Number((await get(token, `/v1/products/${id}`)).stockQuantity)

// Two shirts size M at 100 + 15% VAT = 230, paid in cash.
async function shirtSale(token: string, customerId: string | null = null) {
  const shirtM = await product(token, "قميص M", 100)
  const sale = await post(token, "/v1/pos/invoices", {
    customerName: null,
    customerId,
    payments: [{ paymentMethodCode: "cash", amount: 230 }],
    discountAmount: 0,
    items: [{ productId: shirtM.id, productName: "قميص M", unitPrice: 100, quantity: 2 }],
  })
  expect(sale.status).toBe(201)
  return { shirtM, sale: sale.body, lineId: sale.body.items[0].id as string }
}

describe("cashier exchanges", () => {
  it("swaps a size at the same price: no money moves, stock moves both ways", async () => {
    const { token } = await signIn("exchange-even@example.com", "Exchange Even")
    const { shirtM, sale, lineId } = await shirtSale(token)
    const shirtL = await product(token, "قميص L", 100)

    const result = await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 1 }],
      reason: "size",
      items: [{ productId: shirtL.id, productName: "قميص L", unitPrice: 100, quantity: 1 }],
    })
    expect(result.status).toBe(201)
    const { exchange, invoice, creditNote } = result.body
    expect(exchange).toMatchObject({
      originalInvoiceId: sale.id,
      returnedAmount: 115,
      newAmount: 115,
      differenceAmount: 0,
      settlement: "even",
      reason: "size",
    })
    // The credit note: linked to the sale, refunded only by the exchange credit.
    expect(creditNote).toMatchObject({ invoiceId: sale.id, totalAmount: 115, reason: "size" })
    expect(creditNote.exchangeId).toBe(exchange.id)
    expect(creditNote.payments).toEqual([
      expect.objectContaining({ paymentMethodCode: "exchange_credit", amount: 115 }),
    ])
    // The new invoice: paid only by the exchange credit.
    expect(invoice).toMatchObject({ totalAmount: 115, exchangeId: exchange.id })
    expect(invoice.payments).toEqual([
      expect.objectContaining({ paymentMethodCode: "exchange_credit", amount: 115 }),
    ])
    expect(invoice.invoiceNumber).not.toBe(sale.invoiceNumber)
    // M: 10 - 2 sold + 1 back = 9. L: 10 - 1 = 9.
    expect(await stockOf(token, shirtM.id)).toBe(9)
    expect(await stockOf(token, shirtL.id)).toBe(9)
    // The original sale is now partly returned; one shirt can still come back, not two.
    const again = await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 2 }],
      reason: "size",
      items: [{ productId: shirtL.id, productName: "قميص L", unitPrice: 100, quantity: 2 }],
    })
    expect(again.status).toBe(400)

    const list = await get(token, "/v1/pos/invoices/exchanges")
    expect(list.items).toHaveLength(1)
    expect(list.items[0]).toMatchObject({
      returnedItems: [expect.objectContaining({ productName: "قميص M", quantity: 1, amount: 115 })],
      newItems: [expect.objectContaining({ productName: "قميص L", quantity: 1, amount: 115 })],
    })
  })

  it("takes the difference when the new item costs more", async () => {
    const { token } = await signIn("exchange-more@example.com", "Exchange More")
    const { sale, lineId } = await shirtSale(token)
    const jacket = await product(token, "جاكيت", 150)

    const result = await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 1 }],
      reason: "color",
      items: [{ productId: jacket.id, productName: "جاكيت", unitPrice: 150, quantity: 1 }],
      // One line is taken as the whole rest (172.50 - 115 = 57.50).
      payments: [{ paymentMethodCode: "cash", amount: 60 }],
    })
    expect(result.status).toBe(201)
    expect(result.body.exchange).toMatchObject({
      returnedAmount: 115,
      newAmount: 172.5,
      differenceAmount: 57.5,
      settlement: "collected",
    })
    expect(result.body.invoice.payments).toEqual([
      expect.objectContaining({ paymentMethodCode: "exchange_credit", amount: 115 }),
      expect.objectContaining({ paymentMethodCode: "cash", amount: 57.5 }),
    ])
  })

  it("gives back what is left when the new item costs less: by a method, or on the balance", async () => {
    const { token } = await signIn("exchange-less@example.com", "Exchange Less")
    const customer = (await post(token, "/v1/customers", {
      name: "نورة",
      email: null,
      phone: null,
      notes: null,
    }).then((result) => result.body)) as { id: string }
    const { sale, lineId } = await shirtSale(token, customer.id)
    const socks = await product(token, "جوارب", 40)

    // Without a choice for the rest, nothing is saved.
    const missing = await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 1 }],
      reason: "other",
      items: [{ productId: socks.id, productName: "جوارب", unitPrice: 40, quantity: 1 }],
    })
    expect(missing.status).toBe(400)
    expect(missing.body.code).toBe("POS_EXCHANGE_REFUND_REQUIRED")
    expect((await get(token, "/v1/pos/invoices/returns")).items).toHaveLength(0)

    // 115 back, 46 out: 69 refunded in cash.
    const refunded = await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 1 }],
      reason: "other",
      items: [{ productId: socks.id, productName: "جوارب", unitPrice: 40, quantity: 1 }],
      refund: { paymentMethodCode: "cash" },
    })
    expect(refunded.status).toBe(201)
    expect(refunded.body.exchange).toMatchObject({
      differenceAmount: -69,
      settlement: "refunded",
      refundPaymentMethodCode: "cash",
    })
    expect(refunded.body.creditNote.payments).toEqual([
      expect.objectContaining({ paymentMethodCode: "exchange_credit", amount: 46 }),
      expect.objectContaining({ paymentMethodCode: "cash", amount: 69 }),
    ])

    // The second shirt: the 69 kept on the customer's balance instead.
    const kept = await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 1 }],
      reason: "other",
      items: [{ productId: socks.id, productName: "جوارب", unitPrice: 40, quantity: 1 }],
      refund: { toCustomerBalance: true },
    })
    expect(kept.status).toBe(201)
    expect(kept.body.exchange.settlement).toBe("balance")
    const detail = await get(token, `/v1/customers/${customer.id}`)
    expect(detail.accountBalance).toBe(69)
  })

  it("keeps a damaged item out of stock, and refuses a balance with no customer", async () => {
    const { token } = await signIn("exchange-damaged@example.com", "Exchange Damaged")
    const { shirtM, sale, lineId } = await shirtSale(token)
    const shirtL = await product(token, "قميص L", 100)

    const noCustomer = await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 1 }],
      reason: "defect",
      items: [{ productId: shirtL.id, productName: "قميص L", unitPrice: 50, quantity: 1 }],
      refund: { toCustomerBalance: true },
    })
    expect(noCustomer.body.code).toBe("POS_EXCHANGE_BALANCE_REQUIRES_CUSTOMER")

    const result = await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 1, restock: false }],
      reason: "defect",
      items: [{ productId: shirtL.id, productName: "قميص L", unitPrice: 100, quantity: 1 }],
    })
    expect(result.status).toBe(201)
    // M stays at 10 - 2: the damaged one did not go back on the shelf.
    expect(await stockOf(token, shirtM.id)).toBe(8)
    expect(result.body.exchange.returnedItems[0].restocked).toBe(false)
  })

  it("counts only the real cash in the shift: the exchange credit never touches the drawer", async () => {
    const { token, actor } = await signIn("exchange-shift@example.com", "Exchange Shift")
    // A running POS trial unlocks shift reports.
    await database.query(
      `insert into organization_subscriptions
         (id, organization_id, application, status, source, started_at, trial_ends_at)
       values ($1, $2, 'pos', 'trial', 'trial', now(), $3)`,
      [randomUUID(), actor.organizationId, new Date(Date.now() + 7 * 86_400_000)]
    )
    const opened = await post(token, "/v1/pos/shifts", {
      workspaceId: actor.workspaceId,
      cashierUserId: actor.userId,
      openingCashAmount: 100,
    })
    expect(opened.status).toBe(201)
    const { sale, lineId } = await shirtSale(token)
    const socks = await product(token, "جوارب", 40)
    const jacket = await product(token, "جاكيت", 150)

    // One shirt for socks (69 cash back), one for a jacket (57.50 cash in).
    await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 1 }],
      reason: "other",
      items: [{ productId: socks.id, productName: "جوارب", unitPrice: 40, quantity: 1 }],
      refund: { paymentMethodCode: "cash" },
    })
    await post(token, `/v1/pos/invoices/${sale.id}/exchanges`, {
      returnItems: [{ invoiceItemId: lineId, quantity: 1 }],
      reason: "size",
      items: [{ productId: jacket.id, productName: "جاكيت", unitPrice: 150, quantity: 1 }],
      payments: [{ paymentMethodCode: "cash", amount: 57.5 }],
    })

    const detail = await get(token, `/v1/pos/shifts/${opened.body.id}/detail`)
    // In: 230 sale + 57.50 difference. Out: 69. Drawer: 100 + 287.50 - 69 = 318.50.
    expect(detail.cashSummary).toMatchObject({ cashSales: 287.5, cashReturns: 69 })
    expect(detail.cashSummary.expectedCashAmount).toBe(318.5)
  })
})
