// @vitest-environment node
//
// The Accounting app (migration 168): entries posted from Madar's documents, the statements built
// on them, the cost of goods fixed at first posting, manual entries, period closing, the chart of
// accounts, and the app's subscription gate.

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

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
      fullName: "Accounting Test",
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
     values ($1, $2, 'hash', 'Accounting Test', now()) on conflict (id) do nothing`,
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

  await mergeOrgSettings(actor.organizationId, { accountingEnabled: true })

  return { token: login.session.accessToken, actor }
}

// pg-mem's jsonb `||` doesn't handle a cast parameter -- read, merge in JS and overwrite.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bodies are asserted field by field
async function call<T = any>(method: string, path: string, token: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: authHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as T }
}

const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" })
const RANGE = `from=2020-01-01&to=${TODAY}`

interface Shop {
  token: string
  organizationId: string
  workspaceId: string
  customerId: string
  supplierId: string
  productId: string
  invoiceId: string
}

// A small shop's week: a product bought, a sale partly on account, an expense, a receipt.
async function seedShop(email: string): Promise<Shop> {
  const { token, actor } = await signIn(email, "Books Shop")
  const organizationId = actor.organizationId
  const workspaceId = actor.workspaceId as string
  const [customerId, supplierId, productId, invoiceId, categoryId, purchaseId] = Array.from(
    { length: 6 },
    () => randomUUID()
  )

  await database.query(
    `insert into products (id, organization_id, product_type, name, cost_price)
     values ($1, $2, 'simple', 'Chair', 40)`,
    [productId, organizationId]
  )
  await database.query(
    "insert into customers (id, organization_id, name) values ($1, $2, 'Sara')",
    [customerId, organizationId]
  )

  // Bought 10 chairs at 50 + 15% VAT: 500 of stock, 75 VAT, 575 owed to the supplier.
  await database.query(
    `insert into suppliers (id, organization_id, code, name, kind)
     values ($1, $2, '#SUP-0001', 'Wood Co', 'local')`,
    [supplierId, organizationId]
  )
  await database.query(
    `insert into purchases (id, organization_id, workspace_id, code, supplier_id, warehouse_id, date)
     values ($1, $2, $3, '#PUR-0001', $4, $3, $5)`,
    [purchaseId, organizationId, workspaceId, supplierId, TODAY]
  )
  await database.query(
    `insert into purchase_line_items (id, purchase_id, product_id, product_name, sku, net_unit_cost, qty, discount, tax_percent)
     values ($1, $2, $3, 'Chair', 'CH-1', 50, 10, 0, 15)`,
    [randomUUID(), purchaseId, productId]
  )

  // Sold 2 chairs for 200 + 30 VAT: 130 in cash, 100 on the customer's account.
  await database.query(
    `insert into pos_invoices
       (id, organization_id, workspace_id, invoice_number, customer_id, payment_method_code,
        subtotal_amount, discount_amount, tax_amount, total_amount)
     values ($1, $2, $3, 'INV-000001', $4, 'split', 200, 0, 30, 230)`,
    [invoiceId, organizationId, workspaceId, customerId]
  )
  await database.query(
    `insert into pos_invoice_items (id, invoice_id, product_id, product_name, unit_price, quantity, line_total)
     values ($1, $2, $3, 'Chair', 100, 2, 200)`,
    [randomUUID(), invoiceId, productId]
  )
  for (const [code, amount] of [
    ["cash", 130],
    ["customer_credit", 100],
  ] as const) {
    await database.query(
      "insert into pos_invoice_payments (id, invoice_id, payment_method_code, amount) values ($1, $2, $3, $4)",
      [randomUUID(), invoiceId, code, amount]
    )
  }

  // Rent paid in cash, 115 including VAT.
  await database.query(
    "insert into expense_categories (id, organization_id, name) values ($1, $2, 'إيجار')",
    [categoryId, organizationId]
  )
  await database.query(
    `insert into expenses (id, organization_id, workspace_id, category_id, name, amount, payment_method, tax_inclusive, expense_date)
     values ($1, $2, $3, $4, 'Rent', 115, 'cash', true, $5)`,
    [randomUUID(), organizationId, workspaceId, categoryId, TODAY]
  )

  // The customer pays 60 of what she owes, in cash.
  await database.query(
    `insert into customer_account_transactions (id, organization_id, customer_id, type, reference, amount, payment_method_code)
     values ($1, $2, $3, 'receipt', 'RCV-00001', 60, 'cash')`,
    [randomUUID(), organizationId, customerId]
  )

  return { token, organizationId, workspaceId, customerId, supplierId, productId, invoiceId }
}

interface TrialRow {
  account: { id: string; code: string; nameEn: string }
  closingDebit: number
  closingCredit: number
}

async function closingBalances(token: string) {
  const trial = await call("GET", `/v1/accounting/reports/trial-balance?${RANGE}`, token)
  expect(trial.status).toBe(200)
  const byName = Object.fromEntries(
    (trial.body.rows as TrialRow[]).map((row) => [
      row.account.nameEn,
      row.closingDebit - row.closingCredit,
    ])
  )
  return { trial: trial.body, byName }
}

describe("accounting: posting from Madar's documents", () => {
  it("posts every document and produces statements that balance", async () => {
    const shop = await seedShop("books@madar.test")

    const { trial, byName } = await closingBalances(shop.token)
    expect(trial.totals.debit).toBe(trial.totals.credit)
    expect(trial.totals.closingDebit).toBe(trial.totals.closingCredit)
    // Debit-positive closing balances.
    expect(byName).toMatchObject({
      "Cash on hand": 75, // 130 sale - 115 rent + 60 receipt
      "Accounts receivable": 40, // 100 on account - 60 received
      Inventory: 420, // 500 bought - 80 sold at cost
      "Input VAT": 90, // 75 purchase + 15 inside the rent
      "Accounts payable": -575,
      "Output VAT": -30,
      "Sales revenue": -200,
      "Cost of goods sold": 80,
      // The expense category got its own account.
      إيجار: 100,
    })

    const income = await call("GET", `/v1/accounting/reports/income-statement?${RANGE}`, shop.token)
    expect(income.body).toMatchObject({ grossProfit: 120, netProfit: 20 })
    expect(income.body.revenue.total).toBe(200)
    expect(income.body.costOfSales.total).toBe(80)
    expect(income.body.operatingExpenses.total).toBe(100)

    const sheet = await call(
      "GET",
      `/v1/accounting/reports/balance-sheet?asOf=${TODAY}`,
      shop.token
    )
    expect(sheet.body).toMatchObject({
      totalAssets: 625,
      totalLiabilities: 605,
      currentEarnings: 20,
      totalLiabilitiesAndEquity: 625,
    })

    const customers = await call(
      "GET",
      `/v1/accounting/reports/parties?type=customer&asOf=${TODAY}`,
      shop.token
    )
    expect(customers.body.items).toEqual([
      expect.objectContaining({ partyId: shop.customerId, name: "Sara", balance: 40 }),
    ])
    const suppliers = await call(
      "GET",
      `/v1/accounting/reports/parties?type=supplier&asOf=${TODAY}`,
      shop.token
    )
    expect(suppliers.body).toMatchObject({ total: 575 })

    const vat = await call("GET", `/v1/accounting/reports/vat?${RANGE}`, shop.token)
    expect(vat.body).toMatchObject({ output: 30, input: 90, due: -60 })

    const overview = await call("GET", `/v1/accounting/overview?${RANGE}`, shop.token)
    expect(overview.body).toMatchObject({ revenue: 200, netProfit: 20, cash: 75, payable: 575 })

    // The cash account's statement: three movements, ending on the same 75.
    const accounts = await call("GET", "/v1/accounting/accounts", shop.token)
    const cash = accounts.body.items.find(
      (item: { nameEn: string }) => item.nameEn === "Cash on hand"
    )
    expect(cash.balance).toBe(75)
    const ledger = await call(
      "GET",
      `/v1/accounting/reports/ledger?accountId=${cash.id}&${RANGE}`,
      shop.token
    )
    expect(ledger.body.lines).toHaveLength(3)
    expect(ledger.body).toMatchObject({ openingBalance: 0, closingBalance: 75 })

    // One entry per document, each balanced.
    const entries = await call("GET", "/v1/accounting/entries?pageSize=100", shop.token)
    expect(entries.body.total).toBe(4)
    const sale = entries.body.items.find(
      (item: { reference: string }) => item.reference === "INV-000001"
    )
    const detail = await call("GET", `/v1/accounting/entries/${sale.id}`, shop.token)
    expect(detail.body.editable).toBe(false)
    const lines = detail.body.lines as Array<{ debit: number; credit: number }>
    expect(lines.reduce((sum, line) => sum + line.debit, 0)).toBe(
      lines.reduce((sum, line) => sum + line.credit, 0)
    )
  })

  it("keeps the cost of a sale as first posted, and drops a cancelled sale", async () => {
    const shop = await seedShop("costs@madar.test")
    expect((await closingBalances(shop.token)).byName["Cost of goods sold"]).toBe(80)

    // The product's cost changes later: sales already posted keep the cost they had.
    await database.query("update products set cost_price = 99 where id = $1", [shop.productId])
    const rebuilt = await call("POST", "/v1/accounting/sync", shop.token, { full: true })
    expect(rebuilt.body).toMatchObject({ ran: true, created: 0, updated: 0, removed: 0 })
    expect((await closingBalances(shop.token)).byName["Cost of goods sold"]).toBe(80)

    // A second pass with nothing changed writes nothing.
    const again = await call("POST", "/v1/accounting/sync", shop.token, { full: false })
    expect(again.body).toMatchObject({ created: 0, updated: 0, removed: 0 })

    // Cancelling the sale takes its entry out of the books.
    await database.query(
      "update pos_invoices set status = 'cancelled', updated_at = now() where id = $1",
      [shop.invoiceId]
    )
    const afterCancel = await call("POST", "/v1/accounting/sync", shop.token, { full: false })
    expect(afterCancel.body).toMatchObject({ removed: 1 })
    const { trial, byName } = await closingBalances(shop.token)
    expect(byName["Sales revenue"] ?? 0).toBe(0)
    expect(byName["Inventory"]).toBe(500)
    expect(trial.totals.closingDebit).toBe(trial.totals.closingCredit)
  })
})

describe("accounting: manual entries, closing and the chart", () => {
  it("accepts only balanced manual entries and numbers them", async () => {
    const shop = await seedShop("manual@madar.test")
    const accounts = (await call("GET", "/v1/accounting/accounts", shop.token)).body
      .items as Array<{
      id: string
      nameEn: string
    }>
    const id = (name: string) => accounts.find((account) => account.nameEn === name)!.id
    const entry = (credit: number) => ({
      date: TODAY,
      description: "Owner puts money in",
      lines: [
        { accountId: id("Bank"), debit: 1000 },
        { accountId: id("Owner's capital"), credit },
      ],
    })

    const unbalanced = await call("POST", "/v1/accounting/entries", shop.token, entry(900))
    expect(unbalanced.status).toBe(422)
    expect(unbalanced.body.code).toBe("ACCOUNTING_ENTRY_UNBALANCED")

    const created = await call("POST", "/v1/accounting/entries", shop.token, entry(1000))
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ reference: "JE-000001", editable: true, amount: 1000 })
    // A refused entry did not use up a number.
    const second = await call("POST", "/v1/accounting/entries", shop.token, entry(1000))
    expect(second.body.reference).toBe("JE-000002")

    const { byName } = await closingBalances(shop.token)
    expect(byName["Bank"]).toBe(2000)
    expect(byName["Owner's capital"]).toBe(-2000)

    const removed = await call("DELETE", `/v1/accounting/entries/${second.body.id}`, shop.token)
    expect(removed.status).toBe(200)
    expect((await closingBalances(shop.token)).byName["Bank"]).toBe(1000)

    // An entry Madar posted from a document can't be edited or deleted here.
    const posted = (await call("GET", "/v1/accounting/entries?sourceType=pos_invoice", shop.token))
      .body.items[0]
    const refused = await call("DELETE", `/v1/accounting/entries/${posted.id}`, shop.token)
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe("ACCOUNTING_ENTRY_POSTED")
  })

  it("closes a period: nothing in it changes afterwards, by hand or by the posting pass", async () => {
    const shop = await seedShop("closing@madar.test")
    const before = (await closingBalances(shop.token)).byName

    const closed = await call("PUT", "/v1/accounting/settings", shop.token, {
      lockedThrough: TODAY,
    })
    expect(closed.body.lockedThrough).toBe(TODAY)

    const accounts = (await call("GET", "/v1/accounting/accounts", shop.token)).body
      .items as Array<{
      id: string
      nameEn: string
    }>
    const manual = await call("POST", "/v1/accounting/entries", shop.token, {
      date: TODAY,
      lines: [
        { accountId: accounts[0].id, debit: 10 },
        { accountId: accounts[1].id, credit: 10 },
      ],
    })
    expect(manual.status).toBe(409)
    expect(manual.body.code).toBe("ACCOUNTING_PERIOD_CLOSED")

    // The sale is cancelled after closing: the closed books keep it.
    await database.query(
      "update pos_invoices set status = 'cancelled', updated_at = now() where id = $1",
      [shop.invoiceId]
    )
    const pass = await call("POST", "/v1/accounting/sync", shop.token, { full: true })
    expect(pass.body).toMatchObject({ removed: 0, updated: 0 })
    expect((await closingBalances(shop.token)).byName).toEqual(before)

    // Reopened, the next pass catches up.
    await call("PUT", "/v1/accounting/settings", shop.token, { lockedThrough: null })
    const caughtUp = await call("POST", "/v1/accounting/sync", shop.token, { full: true })
    expect(caughtUp.body).toMatchObject({ removed: 1 })
  })

  it("manages the chart of accounts, protecting the accounts Madar posts to", async () => {
    const shop = await seedShop("chart@madar.test")
    const account = {
      code: "6150",
      nameAr: "عمولات",
      nameEn: "Commissions",
      type: "expense",
      section: "operating_expense",
    }
    const created = await call("POST", "/v1/accounting/accounts", shop.token, account)
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ code: "6150", isSystem: false })

    const duplicate = await call("POST", "/v1/accounting/accounts", shop.token, account)
    expect(duplicate.status).toBe(409)

    const wrongSection = await call("POST", "/v1/accounting/accounts", shop.token, {
      ...account,
      code: "6151",
      section: "current_asset",
    })
    expect(wrongSection.status).toBe(422)

    const renamed = await call("PUT", `/v1/accounting/accounts/${created.body.id}`, shop.token, {
      ...account,
      nameEn: "Sales commissions",
    })
    expect(renamed.body.nameEn).toBe("Sales commissions")
    expect(
      (await call("DELETE", `/v1/accounting/accounts/${created.body.id}`, shop.token)).status
    ).toBe(200)

    const accounts = (await call("GET", "/v1/accounting/accounts", shop.token)).body
      .items as Array<{
      id: string
      nameEn: string
      isSystem: boolean
    }>
    const cash = accounts.find((item) => item.nameEn === "Cash on hand")!
    expect(cash.isSystem).toBe(true)
    const deleteSystem = await call("DELETE", `/v1/accounting/accounts/${cash.id}`, shop.token)
    expect(deleteSystem.status).toBe(409)
    expect(deleteSystem.body.code).toBe("ACCOUNTING_SYSTEM_ACCOUNT")
  })

  it("is closed to an organization without the Accounting app", async () => {
    const shop = await seedShop("gate@madar.test")
    await mergeOrgSettings(shop.organizationId, { accountingEnabled: false })
    const refused = await call("GET", "/v1/accounting/accounts", shop.token)
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe("APPLICATION_NOT_SUBSCRIBED")
  })
})
