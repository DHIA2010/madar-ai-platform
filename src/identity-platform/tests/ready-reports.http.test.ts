// @vitest-environment node
//
// Covers the 4 hand-written ready-report aggregation endpoints (src/identity-platform/reports/
// ready-reports-*.ts): net income (sales/returns/COGS/expenses math), sales-by-user-payment-
// method, sales-by-customer, sales-by-product, and cross-org isolation.

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
      fullName: "Ready Reports Test",
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
     values ($1, $2, 'hash', 'Ready Reports Test', now()) on conflict (id) do nothing`,
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

async function seedWorkspace(organizationId: string, name: string) {
  const id = randomUUID()
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1,$2,$3,'active')`,
    [id, organizationId, name]
  )
  return id
}

async function seedCashier(organizationId: string, name: string) {
  const id = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', $3, now())`,
    [id, `${id}@cashier.test`, name]
  )
  return id
}

async function seedCustomer(
  organizationId: string,
  name: string,
  createdAt = new Date().toISOString()
) {
  const id = randomUUID()
  await database.query(
    `insert into customers (id, organization_id, name, created_at) values ($1,$2,$3,$4)`,
    [id, organizationId, name, createdAt]
  )
  return id
}

async function seedProduct(organizationId: string, name: string, costPrice: number) {
  const id = randomUUID()
  await database.query(
    `insert into products (id, organization_id, product_type, name, status, cost_price)
     values ($1,$2,'simple',$3,'active',$4)`,
    [id, organizationId, name, costPrice]
  )
  return id
}

async function seedInvoice(opts: {
  organizationId: string
  workspaceId: string
  cashierUserId?: string | null
  customerId?: string | null
  customerName?: string
  paymentMethod?: string
  subtotal: number
  tax: number
  total: number
  createdAt?: string
  status?: string
}) {
  const id = randomUUID()
  await database.query(
    `insert into pos_invoices (
       id, organization_id, workspace_id, invoice_number, status, customer_id, customer_name,
       cashier_user_id, payment_method_code, subtotal_amount, tax_amount, total_amount, created_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      opts.organizationId,
      opts.workspaceId,
      `INV-${id.slice(0, 8)}`,
      opts.status ?? "completed",
      opts.customerId ?? null,
      opts.customerName ?? null,
      opts.cashierUserId ?? null,
      opts.paymentMethod ?? "cash",
      opts.subtotal,
      opts.tax,
      opts.total,
      opts.createdAt ?? new Date().toISOString(),
    ]
  )
  return id
}

async function seedInvoiceItem(opts: {
  invoiceId: string
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  lineTotal: number
}) {
  const id = randomUUID()
  await database.query(
    `insert into pos_invoice_items (id, invoice_id, product_id, product_name, unit_price, quantity, line_total)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      opts.invoiceId,
      opts.productId,
      opts.productName,
      opts.unitPrice,
      opts.quantity,
      opts.lineTotal,
    ]
  )
  return id
}

async function seedReturn(opts: {
  organizationId: string
  workspaceId: string
  invoiceId: string
  total: number
  createdAt?: string
}) {
  const id = randomUUID()
  await database.query(
    `insert into pos_invoice_returns (id, organization_id, workspace_id, invoice_id, return_number, total_amount, created_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      opts.organizationId,
      opts.workspaceId,
      opts.invoiceId,
      `RET-${id.slice(0, 8)}`,
      opts.total,
      opts.createdAt ?? new Date().toISOString(),
    ]
  )
  return id
}

async function seedReturnItem(opts: {
  returnId: string
  invoiceItemId: string
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  netAmount: number
}) {
  await database.query(
    `insert into pos_invoice_return_items (id, return_id, invoice_item_id, product_id, product_name, unit_price, quantity, net_amount)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      randomUUID(),
      opts.returnId,
      opts.invoiceItemId,
      opts.productId,
      opts.productName,
      opts.unitPrice,
      opts.quantity,
      opts.netAmount,
    ]
  )
}

async function seedExpense(opts: {
  organizationId: string
  workspaceId: string
  amount: number
  expenseDate?: string
}) {
  const categoryId = randomUUID()
  await database.query(
    `insert into expense_categories (id, organization_id, name, created_at) values ($1,$2,$3, now())`,
    [categoryId, opts.organizationId, `Category ${categoryId.slice(0, 6)}`]
  )
  await database.query(
    `insert into expenses (id, organization_id, workspace_id, category_id, name, amount, payment_method, expense_date, created_at, updated_at)
     values ($1,$2,$3,$4,'Test expense',$5,'cash',$6, now(), now())`,
    [
      randomUUID(),
      opts.organizationId,
      opts.workspaceId,
      categoryId,
      opts.amount,
      opts.expenseDate ?? new Date().toISOString().slice(0, 10),
    ]
  )
}

const RANGE = `from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z`

describe("ready reports", () => {
  it("computes net income correctly (sales/tax/returns/COGS/expenses)", async () => {
    const { token, actor } = await signIn("owner-net-income@example.com", "Net Income Org")
    const organizationId = actor.organizationId
    const workspaceId = actor.workspaceId as string

    const productId = await seedProduct(organizationId, "Widget", 10)
    const invoiceId = await seedInvoice({
      organizationId,
      workspaceId,
      subtotal: 170,
      tax: 30,
      total: 200,
      createdAt: "2026-01-15T10:00:00.000Z",
    })
    const invoiceItemId = await seedInvoiceItem({
      invoiceId,
      productId,
      productName: "Widget",
      unitPrice: 40,
      quantity: 5,
      lineTotal: 200,
    })
    const returnId = await seedReturn({
      organizationId,
      workspaceId,
      invoiceId,
      total: 50,
      createdAt: "2026-01-16T10:00:00.000Z",
    })
    await seedReturnItem({
      returnId,
      invoiceItemId,
      productId,
      productName: "Widget",
      unitPrice: 40,
      quantity: 1,
      netAmount: 40,
    })
    // Dated exactly on the range's end-day -- regression coverage for a real bug where the
    // exclusive upper bound, compared against a plain `date` column, truncated the `to` timestamp
    // down to this same calendar day and wrongly excluded it (`expense_date < '2026-02-01'` is
    // false for an expense also dated '2026-02-01'; fixed to `<= ?::date`).
    await seedExpense({ organizationId, workspaceId, amount: 40, expenseDate: "2026-02-01" })

    const response = await fetch(`${baseUrl}/v1/reports/ready/net-income?${RANGE}`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      totals: {
        sales: number
        tax: number
        returns: number
        netSales: number
        cogs: number
        returnedCogs: number
        expenses: number
        netIncome: number
      }
    }

    expect(body.totals.sales).toBe(200)
    expect(body.totals.tax).toBe(30)
    expect(body.totals.returns).toBe(50)
    expect(body.totals.netSales).toBe(150)
    expect(body.totals.cogs).toBe(50) // 5 * 10
    expect(body.totals.returnedCogs).toBe(10) // 1 * 10
    expect(body.totals.expenses).toBe(40)
    // sales - tax - returns - cogs + returnedCogs - expenses = 200 - 30 - 50 - 50 + 10 - 40 = 40.
    expect(body.totals.netIncome).toBe(40)
  })

  it("compares net income across every branch, ignoring the page's own branch filter", async () => {
    const { token, actor } = await signIn(
      "owner-net-income-branch@example.com",
      "Net Income Branch Org"
    )
    const organizationId = actor.organizationId
    const workspaceA = actor.workspaceId as string
    const workspaceB = await seedWorkspace(organizationId, "Second Branch")

    // Branch A: profitable.
    await seedInvoice({
      organizationId,
      workspaceId: workspaceA,
      subtotal: 90,
      tax: 10,
      total: 100,
      createdAt: "2026-01-10T10:00:00.000Z",
    })
    // Branch B: unprofitable (expenses with no offsetting sales).
    await seedExpense({
      organizationId,
      workspaceId: workspaceB,
      amount: 500,
      expenseDate: "2026-01-12",
    })

    // Querying with workspaceId set to branch A should NOT narrow byBranch -- it must still
    // report both branches, since the whole point is comparing them.
    const response = await fetch(
      `${baseUrl}/v1/reports/ready/net-income?${RANGE}&workspaceId=${workspaceA}`,
      { headers: authHeaders(token) }
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      byBranch: Array<{ workspaceId: string; workspaceName: string; netIncome: number }>
    }

    expect(body.byBranch).toHaveLength(2)
    const branchA = body.byBranch.find((b) => b.workspaceId === workspaceA)
    const branchB = body.byBranch.find((b) => b.workspaceId === workspaceB)
    expect(branchA?.netIncome).toBe(90) // sales 100 - tax 10
    expect(branchB?.netIncome).toBe(-500)
    // Sorted highest net income first.
    expect(body.byBranch[0].workspaceId).toBe(workspaceA)
  })

  it("groups sales by cashier user and payment method", async () => {
    const { token, actor } = await signIn("owner-user-pm@example.com", "User PM Org")
    const organizationId = actor.organizationId
    const workspaceId = actor.workspaceId as string

    const cashierA = await seedCashier(organizationId, "Cashier A")
    const cashierB = await seedCashier(organizationId, "Cashier B")
    await seedInvoice({
      organizationId,
      workspaceId,
      cashierUserId: cashierA,
      paymentMethod: "cash",
      subtotal: 90,
      tax: 10,
      total: 100,
      createdAt: "2026-01-10T10:00:00.000Z",
    })
    await seedInvoice({
      organizationId,
      workspaceId,
      cashierUserId: cashierB,
      paymentMethod: "card",
      subtotal: 180,
      tax: 20,
      total: 200,
      createdAt: "2026-01-11T10:00:00.000Z",
    })

    const response = await fetch(
      `${baseUrl}/v1/reports/ready/sales-by-user-payment-method?${RANGE}`,
      { headers: authHeaders(token) }
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      rows: Array<{ cashierName: string; paymentMethod: string; totalSales: number }>
      kpis: { userCount: number; paymentMethodCount: number; totalPayments: number }
    }

    expect(body.rows).toHaveLength(2)
    expect(body.kpis.userCount).toBe(2)
    expect(body.kpis.paymentMethodCount).toBe(2)
    expect(body.kpis.totalPayments).toBe(300)
  })

  it("aggregates sales by customer with new-customer and trend data", async () => {
    const { token, actor } = await signIn("owner-customer@example.com", "Customer Org")
    const organizationId = actor.organizationId
    const workspaceId = actor.workspaceId as string

    const customerA = await seedCustomer(organizationId, "Customer A", "2026-01-05T00:00:00.000Z")
    const customerB = await seedCustomer(organizationId, "Customer B", "2026-01-06T00:00:00.000Z")
    await seedInvoice({
      organizationId,
      workspaceId,
      customerId: customerA,
      subtotal: 90,
      tax: 10,
      total: 100,
      createdAt: "2026-01-10T10:00:00.000Z",
    })
    await seedInvoice({
      organizationId,
      workspaceId,
      customerId: customerB,
      subtotal: 270,
      tax: 30,
      total: 300,
      createdAt: "2026-01-12T10:00:00.000Z",
    })

    const response = await fetch(`${baseUrl}/v1/reports/ready/sales-by-customer?${RANGE}`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      kpis: {
        newCustomers: { value: number }
        customerCount: { value: number }
        totalSales: { value: number }
      }
      customers: Array<{ customerName: string; totalSales: number }>
      trend: Array<{ name: string; bucket: string; value: number }>
    }

    expect(body.kpis.newCustomers.value).toBe(2)
    expect(body.kpis.customerCount.value).toBe(2)
    expect(body.kpis.totalSales.value).toBe(400)
    expect(body.customers[0].customerName).toBe("Customer B")
    expect(body.customers[0].totalSales).toBe(300)
    expect(body.trend.length).toBeGreaterThan(0)
  })

  it("aggregates sales by product with category breakdown", async () => {
    const { token, actor } = await signIn("owner-product@example.com", "Product Org")
    const organizationId = actor.organizationId
    const workspaceId = actor.workspaceId as string

    const productId = await seedProduct(organizationId, "Gadget", 5)
    const invoiceId = await seedInvoice({
      organizationId,
      workspaceId,
      subtotal: 90,
      tax: 10,
      total: 100,
      createdAt: "2026-01-14T10:00:00.000Z",
    })
    await seedInvoiceItem({
      invoiceId,
      productId,
      productName: "Gadget",
      unitPrice: 50,
      quantity: 2,
      lineTotal: 100,
    })

    const response = await fetch(`${baseUrl}/v1/reports/ready/sales-by-product?${RANGE}`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      kpis: { totalSales: number; netSales: number }
      products: Array<{ productName: string; quantitySold: number; totalSales: number }>
      categories: Array<{ category: string; totalSales: number }>
    }

    expect(body.products).toHaveLength(1)
    expect(body.products[0].productName).toBe("Gadget")
    expect(body.products[0].quantitySold).toBe(2)
    expect(body.kpis.totalSales).toBe(100)
    expect(body.kpis.netSales).toBe(100)
    expect(body.categories.length).toBeGreaterThan(0)
  })

  it("isolates ready-report data across organizations", async () => {
    const orgA = await signIn("owner-ready-a@example.com", "Ready Org A")
    const orgB = await signIn("owner-ready-b@example.com", "Ready Org B")

    await seedInvoice({
      organizationId: orgA.actor.organizationId,
      workspaceId: orgA.actor.workspaceId as string,
      subtotal: 90,
      tax: 10,
      total: 100,
      createdAt: "2026-01-10T10:00:00.000Z",
    })

    const response = await fetch(
      `${baseUrl}/v1/reports/ready/sales-by-user-payment-method?${RANGE}`,
      { headers: authHeaders(orgB.token) }
    )
    const body = (await response.json()) as { rows: unknown[] }
    expect(body.rows).toHaveLength(0)
  })

  // A dedicated "missing expenses:view still has reports:view -> 403 on net-income" test isn't
  // feasible on this harness: a freshly-registered owner always resolves full permissions (no
  // invitation endpoint exists here to create a second, lower-privileged real actor -- see the
  // identical, already-documented limitation in expenses.http.test.ts). The
  // `actor.modulePermissions.includes("expenses:view")` check is the same one-line shape used by
  // every other permission-gated route in server.ts.
})
