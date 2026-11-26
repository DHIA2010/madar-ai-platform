// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the API answers are read loosely here */
//
// The Laundry app (/v1/laundry/*): the price list, orders through their statuses, paying at
// drop-off, by deposit or at pickup (each invoiced once), subscriptions, unclaimed orders and
// the report.

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
     values ($1, $2, $3, 'active', '{"posEnabled": true}'::jsonb) on conflict (id) do nothing`,
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

  // The Laundry plugin, switched on (it is off until the business turns it on).
  await fetch(`${baseUrl}/v1/plugins/laundry`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ enabled: true }),
  })

  return { token, actor }
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: authHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : null) as any }
}

// A thobe (wash and iron 10 SAR, iron only 5) and a blanket (wash 25), VAT included.
async function priceList(token: string) {
  const catalog = (await call(token, "GET", "/v1/laundry/catalog")).body
  const thobe = catalog.items.find((item: any) => item.name === "ثوب")
  const blanket = catalog.items.find((item: any) => item.name === "بطانية")
  const washIron = catalog.services.find((service: any) => service.name === "غسيل وكوي")
  const ironOnly = catalog.services.find((service: any) => service.name === "كوي فقط")
  const saved = await call(token, "PUT", "/v1/laundry/prices", {
    prices: [
      { itemId: thobe.id, serviceId: washIron.id, price: 10 },
      { itemId: thobe.id, serviceId: ironOnly.id, price: 5 },
      { itemId: blanket.id, serviceId: washIron.id, price: 25 },
    ],
  })
  expect(saved.status).toBe(200)
  return { thobe, blanket, washIron, ironOnly }
}

describe("laundry", () => {
  it("starts with common items and services, and prices them in a grid", async () => {
    const { token } = await signIn("laundry-catalog@example.com", "Laundry Catalog")
    const catalog = (await call(token, "GET", "/v1/laundry/catalog")).body
    expect(catalog.items.map((item: any) => item.name)).toContain("ثوب")
    expect(catalog.services.map((service: any) => service.name)).toEqual([
      "غسيل وكوي",
      "كوي فقط",
      "تنظيف جاف",
      "غسيل فقط",
    ])
    const { thobe, washIron } = await priceList(token)
    const after = (await call(token, "GET", "/v1/laundry/catalog")).body
    expect(after.prices[`${thobe.id}:${washIron.id}`]).toBe(10)
  })

  it("takes an order through its stages and invoices it at pickup", async () => {
    const { token } = await signIn("laundry-flow@example.com", "Laundry Flow")
    const { thobe, washIron } = await priceList(token)
    const created = await call(token, "POST", "/v1/laundry/orders", {
      customerName: "نورة",
      customerPhone: "0551230001",
      lines: [{ itemId: thobe.id, serviceId: washIron.id, quantity: 2, note: "بقعة على الكم" }],
      urgent: true,
      payment: { mode: "later" },
    })
    expect(created.status).toBe(201)
    const order = created.body
    // 2 x 10, plus 50% urgent = 30.
    expect(order).toMatchObject({
      status: "received",
      pieces: 2,
      itemsTotal: 20,
      urgentFee: 10,
      total: 30,
      due: 30,
      paid: false,
      invoiceNumber: null,
    })
    expect(order.orderNumber).toMatch(/^LND-\d{6}$/)
    expect(order.customerId).toBeTruthy()
    expect(order.whatsapp.readyUrl).toContain("https://wa.me/966551230001")

    expect(
      (await call(token, "POST", `/v1/laundry/orders/${order.id}/status`, { status: "processing" }))
        .body.status
    ).toBe("processing")
    const ready = (
      await call(token, "POST", `/v1/laundry/orders/${order.id}/status`, { status: "ready" })
    ).body
    expect(ready.status).toBe("ready")
    expect(ready.readyAt).toBeTruthy()

    const done = (
      await call(token, "POST", `/v1/laundry/orders/${order.id}/collect`, {
        paymentMethodCode: "cash",
      })
    ).body
    expect(done).toMatchObject({ status: "delivered", paid: true, due: 0 })
    expect(done.invoiceNumber).toMatch(/^INV-/)
    const invoices = (await call(token, "GET", "/v1/pos/invoices")).body.items
    const invoice = invoices.find((entry: any) => entry.invoiceNumber === done.invoiceNumber)
    expect(invoice.totalAmount).toBe(30)
    expect(invoice.items.map((item: any) => item.productName)).toEqual([
      "ثوب - غسيل وكوي",
      "رسوم الاستعجال",
    ])
    // Collecting twice changes nothing.
    const again = (
      await call(token, "POST", `/v1/laundry/orders/${order.id}/collect`, {
        paymentMethodCode: "cash",
      })
    ).body
    expect(again.invoiceNumber).toBe(done.invoiceNumber)
  })

  it("puts a deposit on the customer's account and uses it on the invoice at pickup", async () => {
    const { token } = await signIn("laundry-deposit@example.com", "Laundry Deposit")
    const { blanket, washIron } = await priceList(token)
    const created = (
      await call(token, "POST", "/v1/laundry/orders", {
        customerName: "خالد",
        customerPhone: "0551230002",
        lines: [{ itemId: blanket.id, serviceId: washIron.id, quantity: 2 }],
        fulfilment: "delivery",
        payment: { mode: "deposit", paymentMethodCode: "cash", amount: 20 },
      })
    ).body
    // 2 x 25, no delivery fee set: 50; 20 paid ahead.
    expect(created).toMatchObject({ total: 50, depositAmount: 20, due: 30, paid: false })
    const customer = (await call(token, "GET", `/v1/customers/${created.customerId}`)).body
    expect(customer.accountBalance).toBe(20)

    const done = (
      await call(token, "POST", `/v1/laundry/orders/${created.id}/collect`, {
        paymentMethodCode: "cash",
      })
    ).body
    const invoice = (await call(token, "GET", "/v1/pos/invoices")).body.items.find(
      (entry: any) => entry.invoiceNumber === done.invoiceNumber
    )
    expect(invoice.payments).toEqual([
      expect.objectContaining({ paymentMethodCode: "customer_wallet", amount: 20 }),
      expect.objectContaining({ paymentMethodCode: "cash", amount: 30 }),
    ])
    expect(
      (await call(token, "GET", `/v1/customers/${created.customerId}`)).body.accountBalance
    ).toBe(0)
  })

  it("invoices at drop-off when paid in full, and refuses to cancel an invoiced order", async () => {
    const { token } = await signIn("laundry-full@example.com", "Laundry Full")
    const { thobe, ironOnly } = await priceList(token)
    const created = (
      await call(token, "POST", "/v1/laundry/orders", {
        customerName: "سارة",
        lines: [{ itemId: thobe.id, serviceId: ironOnly.id, quantity: 3 }],
        payment: { mode: "full", paymentMethodCode: "cash" },
      })
    ).body
    expect(created).toMatchObject({ total: 15, paid: true, due: 0 })
    expect(created.invoiceNumber).toMatch(/^INV-/)
    const cancel = await call(token, "POST", `/v1/laundry/orders/${created.id}/cancel`)
    expect(cancel.body.code).toBe("LAUNDRY_ORDER_INVOICED")
    // A missing price is refused.
    const missing = await call(token, "POST", "/v1/laundry/orders", {
      customerName: "سارة",
      lines: [{ itemId: thobe.id, serviceId: thobe.id, quantity: 1 }],
      payment: { mode: "later" },
    })
    expect(missing.body.code).toBe("LAUNDRY_PRICE_MISSING")
  })

  it("sells a pieces plan, takes pieces off it, and gives them back on cancel", async () => {
    const { token } = await signIn("laundry-plan@example.com", "Laundry Plan")
    const { thobe, washIron } = await priceList(token)
    const plans = (
      await call(token, "POST", "/v1/laundry/plans", {
        name: "شهري 30 قطعة",
        pieces: 30,
        price: 150,
        validDays: 30,
      })
    ).body.items
    const sold = await call(token, "POST", "/v1/laundry/subscriptions", {
      planId: plans[0].id,
      customerName: "مها",
      customerPhone: "0551230003",
      paymentMethodCode: "cash",
    })
    expect(sold.status).toBe(201)
    expect(sold.body).toMatchObject({ piecesTotal: 30, piecesLeft: 30, active: true })
    expect(sold.body.invoiceNumber).toMatch(/^INV-/)

    const order = (
      await call(token, "POST", "/v1/laundry/orders", {
        customerPhone: "0551230003",
        lines: [{ itemId: thobe.id, serviceId: washIron.id, quantity: 3 }],
        payment: { mode: "later" },
      })
    ).body
    expect(order.customerId).toBe(sold.body.customerId)
    expect(order).toMatchObject({ total: 0, paid: true, due: 0 })
    expect(order.lines[0]).toMatchObject({ quantity: 3, coveredQuantity: 3, lineTotal: 0 })
    let subscriptions = (
      await call(token, "GET", `/v1/laundry/subscriptions?customerId=${order.customerId}`)
    ).body.items
    expect(subscriptions[0].piecesLeft).toBe(27)

    await call(token, "POST", `/v1/laundry/orders/${order.id}/cancel`)
    subscriptions = (
      await call(token, "GET", `/v1/laundry/subscriptions?customerId=${order.customerId}`)
    ).body.items
    expect(subscriptions[0].piecesLeft).toBe(30)
  })

  it("lists unclaimed orders and reports on the period", async () => {
    const { token } = await signIn("laundry-unclaimed@example.com", "Laundry Unclaimed")
    const { thobe, washIron } = await priceList(token)
    const order = (
      await call(token, "POST", "/v1/laundry/orders", {
        customerName: "فهد",
        customerPhone: "0551230004",
        lines: [{ itemId: thobe.id, serviceId: washIron.id, quantity: 4 }],
        payment: { mode: "later" },
      })
    ).body
    await call(token, "POST", `/v1/laundry/orders/${order.id}/status`, { status: "ready" })
    expect(
      (await call(token, "GET", "/v1/laundry/orders?status=unclaimed")).body.items
    ).toHaveLength(0)
    await database.query(`UPDATE laundry_orders SET ready_at = $2 WHERE id = $1`, [
      order.id,
      new Date(Date.now() - 10 * 86_400_000).toISOString(),
    ])
    const unclaimed = (await call(token, "GET", "/v1/laundry/orders?status=unclaimed")).body.items
    expect(unclaimed.map((entry: any) => entry.id)).toEqual([order.id])
    const reminded = (
      await call(token, "POST", `/v1/laundry/orders/${order.id}/notified`, { kind: "reminder" })
    ).body
    expect(reminded.remindedAt).toBeTruthy()

    const report = (await call(token, "GET", "/v1/laundry/report")).body
    expect(report).toMatchObject({
      orders: 1,
      pieces: 4,
      revenue: 40,
      outstanding: 40,
      readyNotCollected: 1,
      unclaimed: 1,
    })
    expect(report.byService).toEqual([{ name: "غسيل وكوي", pieces: 4 }])
  })

  it("is a plugin of the cashier: switched on and off at will, and only with POS", async () => {
    const { token, actor } = await signIn("laundry-off@example.com", "Laundry Off")
    expect((await call(token, "GET", "/v1/plugins")).body.items).toEqual([
      { id: "laundry", enabled: true },
    ])
    // Off: its routes refuse, and its data stays.
    const { thobe, washIron } = await priceList(token)
    await call(token, "PUT", "/v1/plugins/laundry", { enabled: false })
    const off = await call(token, "GET", "/v1/laundry/catalog")
    expect(off.status).toBe(403)
    expect(off.body.code).toBe("LAUNDRY_PLUGIN_OFF")
    // On again: everything is still there.
    await call(token, "PUT", "/v1/plugins/laundry", { enabled: true })
    const back = (await call(token, "GET", "/v1/laundry/catalog")).body
    expect(back.prices[`${thobe.id}:${washIron.id}`]).toBe(10)
    // Without the cashier app, neither the plugins nor laundry answer.
    await database.query(`UPDATE organizations SET settings = '{}'::jsonb WHERE id = $1`, [
      actor.organizationId,
    ])
    expect((await call(token, "GET", "/v1/plugins")).status).toBeGreaterThanOrEqual(400)
    expect((await call(token, "GET", "/v1/laundry/catalog")).status).toBeGreaterThanOrEqual(400)
  })

  it("counts a cash deposit and the cash paid at pickup in the cashier's shift drawer", async () => {
    const { token, actor } = await signIn("laundry-shift@example.com", "Laundry Shift")
    // A running POS trial unlocks shift reports.
    await database.query(
      `insert into organization_subscriptions
         (id, organization_id, application, status, source, started_at, trial_ends_at)
       values ($1, $2, 'pos', 'trial', 'trial', now(), $3)`,
      [randomUUID(), actor.organizationId, new Date(Date.now() + 7 * 86_400_000)]
    )
    const shift = (
      await call(token, "POST", "/v1/pos/shifts", {
        workspaceId: actor.workspaceId,
        cashierUserId: actor.userId,
        openingCashAmount: 100,
      })
    ).body
    const { blanket, washIron } = await priceList(token)
    const order = (
      await call(token, "POST", "/v1/laundry/orders", {
        customerName: "ريم",
        customerPhone: "0551230009",
        lines: [{ itemId: blanket.id, serviceId: washIron.id, quantity: 2 }],
        payment: { mode: "deposit", paymentMethodCode: "cash", amount: 20 },
      })
    ).body
    let detail = (await call(token, "GET", `/v1/pos/shifts/${shift.id}/detail`)).body
    // The 20 deposit is in the drawer, though nothing was invoiced yet.
    expect(detail.cashSummary).toMatchObject({ cashSales: 0, customerReceipts: 20 })
    expect(detail.cashSummary.expectedCashAmount).toBe(120)

    await call(token, "POST", `/v1/laundry/orders/${order.id}/collect`, {
      paymentMethodCode: "cash",
    })
    detail = (await call(token, "GET", `/v1/pos/shifts/${shift.id}/detail`)).body
    // At pickup only the 30 left came into the drawer: the deposit paid the rest of the invoice.
    expect(detail.cashSummary).toMatchObject({ cashSales: 30, customerReceipts: 20 })
    expect(detail.cashSummary.expectedCashAmount).toBe(150)
  })

  it("renames and deletes pieces and services", async () => {
    const { token } = await signIn("laundry-edit@example.com", "Laundry Edit")
    const { thobe, washIron } = await priceList(token)
    const renamed = (
      await call(token, "PUT", `/v1/laundry/services/${washIron.id}`, { name: "غسيل وكي" })
    ).body
    expect(renamed.services.find((service: any) => service.id === washIron.id).name).toBe(
      "غسيل وكي"
    )
    const added = (await call(token, "POST", "/v1/laundry/items", { name: "سجادة" })).body
    const rug = added.items.find((item: any) => item.name === "سجادة")
    const afterItem = (await call(token, "DELETE", `/v1/laundry/items/${rug.id}`)).body
    expect(afterItem.items.some((item: any) => item.id === rug.id)).toBe(false)
    const afterService = (await call(token, "DELETE", `/v1/laundry/services/${washIron.id}`)).body
    expect(afterService.services.some((service: any) => service.id === washIron.id)).toBe(false)
    expect(afterService.prices[`${thobe.id}:${washIron.id}`]).toBeUndefined()
  })
})
