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

interface VatLineAmounts {
  amount: number
  adjustmentAmount: number
  amountAfterAdjustment: number
  vatAmount: number
}

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
  subtotal?: number
  tax?: number
  createdAt?: string
}) {
  const id = randomUUID()
  await database.query(
    `insert into pos_invoice_returns (id, organization_id, workspace_id, invoice_id, return_number, subtotal_amount, tax_amount, total_amount, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      opts.organizationId,
      opts.workspaceId,
      opts.invoiceId,
      `RET-${id.slice(0, 8)}`,
      opts.subtotal ?? opts.total,
      opts.tax ?? 0,
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
  taxInclusive?: boolean
  status?: "active" | "cancelled"
}) {
  const categoryId = randomUUID()
  await database.query(
    `insert into expense_categories (id, organization_id, name, created_at) values ($1,$2,$3, now())`,
    [categoryId, opts.organizationId, `Category ${categoryId.slice(0, 6)}`]
  )
  await database.query(
    // status is listed last, matching its true physical column position (appended at the end by
    // migration 098, after deleted_at) -- pg-mem's check-constraint evaluator maps VALUES
    // positionally against the table's declared column order rather than this INSERT's own
    // explicit list, so reordering status earlier spuriously trips its check constraint (same
    // gotcha already hit and documented for purchase_returns.status elsewhere in this file).
    `insert into expenses (id, organization_id, workspace_id, category_id, name, amount, payment_method, tax_inclusive, expense_date, created_at, updated_at, status)
     values ($1,$2,$3,$4,'Test expense',$5,'cash',$6,$7, now(), now(), $8)`,
    [
      randomUUID(),
      opts.organizationId,
      opts.workspaceId,
      categoryId,
      opts.amount,
      opts.taxInclusive ?? false,
      opts.expenseDate ?? new Date().toISOString().slice(0, 10),
      opts.status ?? "active",
    ]
  )
}

async function seedSupplier(
  organizationId: string,
  workspaceId: string,
  opts?: { name?: string; taxNumber?: string }
) {
  const id = randomUUID()
  await database.query(
    `insert into suppliers (id, organization_id, workspace_id, code, name, kind, status, company_details)
     values ($1,$2,$3,$4,$5,'local','active',$6::jsonb)`,
    [
      id,
      organizationId,
      workspaceId,
      `SUP-${id.slice(0, 8)}`,
      opts?.name ?? "Test Supplier",
      JSON.stringify(opts?.taxNumber ? { taxNumber: opts.taxNumber } : {}),
    ]
  )
  return id
}

async function seedPurchase(opts: {
  organizationId: string
  workspaceId: string
  supplierId: string
  date?: string
  referenceNumber?: string
  orderTaxPercent?: number
}) {
  const id = randomUUID()
  await database.query(
    `insert into purchases (id, organization_id, workspace_id, code, supplier_id, warehouse_id, date, status, reference_number, order_tax_percent)
     values ($1,$2,$3,$4,$5,'main',$6,'pending',$7,$8)`,
    [
      id,
      opts.organizationId,
      opts.workspaceId,
      `PUR-${id.slice(0, 8)}`,
      opts.supplierId,
      opts.date ?? new Date().toISOString().slice(0, 10),
      opts.referenceNumber ?? null,
      opts.orderTaxPercent ?? 0,
    ]
  )
  return id
}

async function seedPurchaseLineItem(opts: {
  purchaseId: string
  productId: string
  netUnitCost: number
  qty: number
  discount?: number
  taxPercent?: number
}) {
  await database.query(
    `insert into purchase_line_items (id, purchase_id, product_id, product_name, sku, net_unit_cost, qty, discount, tax_percent, position)
     values ($1,$2,$3,'Test Product','SKU-TEST',$4,$5,$6,$7,0)`,
    [
      randomUUID(),
      opts.purchaseId,
      opts.productId,
      opts.netUnitCost,
      opts.qty,
      opts.discount ?? 0,
      opts.taxPercent ?? 0,
    ]
  )
}

async function seedPurchaseReturn(opts: {
  organizationId: string
  workspaceId: string
  purchaseId: string
  supplierId: string
  returnDate?: string
}) {
  const id = randomUUID()
  await database.query(
    // status is 'full' | 'partial' (migration 095 replaced the old editable workflow states) --
    // these seeds only ever return part of what was purchased.
    `insert into purchase_returns (id, organization_id, workspace_id, code, purchase_id, supplier_id, warehouse_id, status, return_date)
     values ($1,$2,$3,$4,$5,$6,'main','partial',$7)`,
    [
      id,
      opts.organizationId,
      opts.workspaceId,
      `RET-${id.slice(0, 8)}`,
      opts.purchaseId,
      opts.supplierId,
      opts.returnDate ?? new Date().toISOString().slice(0, 10),
    ]
  )
  return id
}

async function seedPurchaseReturnItem(opts: {
  returnId: string
  productId: string
  unitCost: number
  qty: number
}) {
  await database.query(
    `insert into purchase_return_items (id, return_id, product_id, product_name, sku, qty, unit_cost, position)
     values ($1,$2,$3,'Test Product','SKU-TEST',$4,$5,0)`,
    [randomUUID(), opts.returnId, opts.productId, opts.qty, opts.unitCost]
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

  it("computes the VAT return, counting only VAT-marked sales/purchases/expenses", async () => {
    const { token, actor } = await signIn("owner-vat@example.com", "VAT Org")
    const workspaceId = actor.workspaceId as string

    // Sales: one standard-rated invoice, one zero-rated invoice.
    const standardInvoiceId = await seedInvoice({
      organizationId: actor.organizationId,
      workspaceId,
      subtotal: 100,
      tax: 15,
      total: 115,
      createdAt: "2026-01-10T10:00:00.000Z",
    })
    const zeroInvoiceId = await seedInvoice({
      organizationId: actor.organizationId,
      workspaceId,
      subtotal: 50,
      tax: 0,
      total: 50,
      createdAt: "2026-01-11T10:00:00.000Z",
    })

    // Sales returns: one against each invoice, netting against the sales figures above.
    await seedReturn({
      organizationId: actor.organizationId,
      workspaceId,
      invoiceId: standardInvoiceId,
      subtotal: 20,
      tax: 3,
      total: 23,
      createdAt: "2026-01-16T10:00:00.000Z",
    })
    await seedReturn({
      organizationId: actor.organizationId,
      workspaceId,
      invoiceId: zeroInvoiceId,
      subtotal: 10,
      tax: 0,
      total: 10,
      createdAt: "2026-01-17T10:00:00.000Z",
    })

    // Purchases: one standard-rated line (with a discount/adjustment), one zero-rated line.
    const supplierId = await seedSupplier(actor.organizationId, workspaceId)
    const productId = await seedProduct(actor.organizationId, "Purchased Widget", 0)
    const standardPurchaseId = await seedPurchase({
      organizationId: actor.organizationId,
      workspaceId,
      supplierId,
      date: "2026-01-12",
    })
    await seedPurchaseLineItem({
      purchaseId: standardPurchaseId,
      productId,
      netUnitCost: 20,
      qty: 5,
      discount: 10,
      taxPercent: 15,
    })
    const zeroPurchaseId = await seedPurchase({
      organizationId: actor.organizationId,
      workspaceId,
      supplierId,
      date: "2026-01-13",
    })
    await seedPurchaseLineItem({
      purchaseId: zeroPurchaseId,
      productId,
      netUnitCost: 30,
      qty: 2,
      taxPercent: 0,
    })

    // Purchase returns: 2 units back against the standard-rated purchase (joins back to its
    // tax_percent=15 line to compute the returned VAT), 1 unit back against the zero-rated one.
    const standardPurchaseReturnId = await seedPurchaseReturn({
      organizationId: actor.organizationId,
      workspaceId,
      purchaseId: standardPurchaseId,
      supplierId,
      returnDate: "2026-01-18",
    })
    await seedPurchaseReturnItem({
      returnId: standardPurchaseReturnId,
      productId,
      unitCost: 20,
      qty: 2,
    })
    const zeroPurchaseReturnId = await seedPurchaseReturn({
      organizationId: actor.organizationId,
      workspaceId,
      purchaseId: zeroPurchaseId,
      supplierId,
      returnDate: "2026-01-19",
    })
    await seedPurchaseReturnItem({
      returnId: zeroPurchaseReturnId,
      productId,
      unitCost: 30,
      qty: 1,
    })

    // Expenses: one tax-inclusive (counts toward the VAT return), one not (e.g. a salary --
    // excluded entirely).
    await seedExpense({
      organizationId: actor.organizationId,
      workspaceId,
      amount: 115,
      taxInclusive: true,
      expenseDate: "2026-01-14",
    })
    await seedExpense({
      organizationId: actor.organizationId,
      workspaceId,
      amount: 50,
      taxInclusive: false,
      expenseDate: "2026-01-15",
    })

    const response = await fetch(`${baseUrl}/v1/reports/ready/vat-return?${RANGE}`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      sales: {
        standardRated: VatLineAmounts
        zeroRated: VatLineAmounts
      }
      purchases: {
        standardRated: VatLineAmounts
        zeroRated: VatLineAmounts
      }
      expenses: VatLineAmounts
      totals: {
        totalSales: number
        totalPurchases: number
        totalExpenses: number
        netVatDue: number
      }
    }

    // amount is always the full gross figure -- returns/discounts show up as a negative
    // adjustmentAmount instead of being netted straight out of amount. Sales: gross 100, returned
    // 20 -> adjustment -20, after-adjustment 80 / vat 15-3=12; zero gross 50, returned 10.
    expect(body.sales.standardRated).toEqual({
      amount: 100,
      adjustmentAmount: -20,
      amountAfterAdjustment: 80,
      vatAmount: 12,
    })
    expect(body.sales.zeroRated).toEqual({
      amount: 50,
      adjustmentAmount: -10,
      amountAfterAdjustment: 40,
      vatAmount: 0,
    })

    // Purchases: standard gross 100, adjustment = -(discount 10 + returned 20*2=40) = -50, so
    // after-adjustment 50 -- vat 13.5 - (40*15%=6) = 7.5 (7.5 / 50 = 15%, the taxable base the VAT
    // is actually computed from). Zero: gross 60, adjustment = -(0 + returned 30*1=30) = -30.
    expect(body.purchases.standardRated).toEqual({
      amount: 100,
      adjustmentAmount: -50,
      amountAfterAdjustment: 50,
      vatAmount: 7.5,
    })
    expect(body.purchases.zeroRated).toEqual({
      amount: 60,
      adjustmentAmount: -30,
      amountAfterAdjustment: 30,
      vatAmount: 0,
    })

    expect(body.expenses).toEqual({
      amount: 100,
      adjustmentAmount: 0,
      amountAfterAdjustment: 100,
      vatAmount: 15,
    })

    // Totals are now sourced from amountAfterAdjustment (the true net taxable base), not the old
    // discount-untouched "amount" -- totalPurchases is 80 (50+30), not 90, since the old figure
    // never subtracted the purchase discount from the headline total.
    expect(body.totals).toEqual({
      totalSales: 120,
      totalPurchases: 80,
      totalExpenses: 100,
      netVatDue: -10.5,
    })
  })

  it("surfaces a cancelled expense as a negative adjustment, not an exclusion from amount", async () => {
    const { token, actor } = await signIn("owner-vat-cancelled@example.com", "VAT Cancel Org")
    const workspaceId = actor.workspaceId as string

    await seedExpense({
      organizationId: actor.organizationId,
      workspaceId,
      amount: 115,
      taxInclusive: true,
      status: "active",
      expenseDate: "2026-01-10",
    })
    await seedExpense({
      organizationId: actor.organizationId,
      workspaceId,
      amount: 230,
      taxInclusive: true,
      status: "cancelled",
      expenseDate: "2026-01-11",
    })

    const response = await fetch(`${baseUrl}/v1/reports/ready/vat-return?${RANGE}`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { expenses: VatLineAmounts }

    // amount stays the full gross (active 100 net + cancelled 200 net = 300) instead of the
    // cancelled expense vanishing -- it shows up as a -200 adjustment instead, landing back at the
    // same 100/15 after-adjustment/VAT figures the VAT return has always declared.
    expect(body.expenses).toEqual({
      amount: 300,
      adjustmentAmount: -200,
      amountAfterAdjustment: 100,
      vatAmount: 15,
    })
  })

  it("treats a purchase using order-level (invoice) tax as standard-rated, not zero-rated", async () => {
    const { token, actor } = await signIn("owner-vat-order-tax@example.com", "VAT Order Tax Org")
    const workspaceId = actor.workspaceId as string

    // Invoice-level tax (purchase-form.tsx's taxLevel toggle): the order carries its own
    // order_tax_percent and every line's own tax_percent is left at 0, unlike the usual per-line
    // tax case the rest of this file's purchases exercise.
    const supplierId = await seedSupplier(actor.organizationId, workspaceId)
    const productId = await seedProduct(actor.organizationId, "Invoice-Tax Widget", 0)
    const purchaseId = await seedPurchase({
      organizationId: actor.organizationId,
      workspaceId,
      supplierId,
      date: "2026-01-12",
      orderTaxPercent: 15,
    })
    await seedPurchaseLineItem({
      purchaseId,
      productId,
      netUnitCost: 100,
      qty: 1,
      taxPercent: 0,
    })

    const returnId = await seedPurchaseReturn({
      organizationId: actor.organizationId,
      workspaceId,
      purchaseId,
      supplierId,
      returnDate: "2026-01-18",
    })
    await seedPurchaseReturnItem({ returnId, productId, unitCost: 100, qty: 0.4 })

    const response = await fetch(`${baseUrl}/v1/reports/ready/vat-return?${RANGE}`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      purchases: { standardRated: VatLineAmounts; zeroRated: VatLineAmounts }
    }

    // gross 100, returned 40 (0.4*100) -> adjustment -40, after-adjustment 60; vat 15 - (40*15%=6) = 9.
    // Without the order_tax_percent fix this would land entirely in zeroRated with vatAmount 0.
    expect(body.purchases.standardRated).toEqual({
      amount: 100,
      adjustmentAmount: -40,
      amountAfterAdjustment: 60,
      vatAmount: 9,
    })
    expect(body.purchases.zeroRated).toEqual({
      amount: 0,
      adjustmentAmount: 0,
      amountAfterAdjustment: 0,
      vatAmount: 0,
    })
  })

  it("computes the purchase invoices report, grouping line items per purchase", async () => {
    const { token, actor } = await signIn("owner-purchase-invoices@example.com", "PI Org")
    // This specific ready-report is gated on the procurement app subscription (unlike vat-return
    // above, which only surfaces a purchases total as one ingredient among several) -- see
    // procurement/guards.ts. pg-mem's jsonb `||` operator mishandles a cast parameter, so
    // select-merge-write instead (same pattern procurement.http.test.ts's own mergeOrgSettings
    // uses).
    const existingSettings = await database.query<{ settings: Record<string, unknown> }>(
      "select settings from organizations where id = $1",
      [actor.organizationId]
    )
    await database.query("update organizations set settings = $2::jsonb where id = $1", [
      actor.organizationId,
      JSON.stringify({
        ...(existingSettings.rows[0]?.settings ?? {}),
        procurementEnabled: true,
      }),
    ])
    const workspaceId = actor.workspaceId as string
    const productId = await seedProduct(actor.organizationId, "Widget", 0)

    const supplierA = await seedSupplier(actor.organizationId, workspaceId, {
      name: "Supplier A",
      taxNumber: "300123456700003",
    })
    const purchaseA = await seedPurchase({
      organizationId: actor.organizationId,
      workspaceId,
      supplierId: supplierA,
      date: "2026-01-05",
      referenceNumber: "INV-1001",
    })
    await seedPurchaseLineItem({
      purchaseId: purchaseA,
      productId,
      netUnitCost: 20,
      qty: 5,
      discount: 10,
      taxPercent: 15,
    })

    const supplierB = await seedSupplier(actor.organizationId, workspaceId, { name: "Supplier B" })
    const purchaseB = await seedPurchase({
      organizationId: actor.organizationId,
      workspaceId,
      supplierId: supplierB,
      date: "2026-01-06",
    })
    await seedPurchaseLineItem({
      purchaseId: purchaseB,
      productId,
      netUnitCost: 10,
      qty: 2,
      taxPercent: 15,
    })
    await seedPurchaseLineItem({
      purchaseId: purchaseB,
      productId,
      netUnitCost: 5,
      qty: 4,
      taxPercent: 0,
    })

    const response = await fetch(`${baseUrl}/v1/reports/ready/purchase-invoices?${RANGE}`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      rows: Array<{
        supplierName: string
        supplierTaxNumber: string | null
        referenceNumber: string | null
        itemCount: number
        amountBeforeTax: number
        vatAmount: number
        total: number
      }>
      kpis: { totalItems: number; totalVat: number; invoiceCount: number; totalPurchases: number }
    }

    expect(body.rows).toHaveLength(2)
    const rowA = body.rows.find((row) => row.supplierName === "Supplier A")
    const rowB = body.rows.find((row) => row.supplierName === "Supplier B")

    expect(rowA).toMatchObject({
      supplierTaxNumber: "300123456700003",
      referenceNumber: "INV-1001",
      itemCount: 1,
      amountBeforeTax: 90,
      vatAmount: 13.5,
      total: 103.5,
    })
    expect(rowB).toMatchObject({
      supplierTaxNumber: null,
      referenceNumber: null,
      itemCount: 2,
      amountBeforeTax: 40,
      vatAmount: 3,
      total: 43,
    })

    expect(body.kpis).toEqual({
      totalItems: 3,
      totalVat: 16.5,
      invoiceCount: 2,
      totalPurchases: 146.5,
    })
  })

  it("buckets the daily sales movement report by hour", async () => {
    const { token, actor } = await signIn("owner-sales-movement@example.com", "Movement Org")
    const workspaceId = actor.workspaceId as string
    const productId = await seedProduct(actor.organizationId, "Widget", 0)

    const invoice9am = await seedInvoice({
      organizationId: actor.organizationId,
      workspaceId,
      subtotal: 100,
      tax: 0,
      total: 100,
      createdAt: "2026-01-10T09:00:00.000Z",
    })
    await seedInvoiceItem({
      invoiceId: invoice9am,
      productId,
      productName: "Widget",
      unitPrice: 50,
      quantity: 2,
      lineTotal: 100,
    })

    const invoice9amSecond = await seedInvoice({
      organizationId: actor.organizationId,
      workspaceId,
      subtotal: 50,
      tax: 0,
      total: 50,
      createdAt: "2026-01-10T09:30:00.000Z",
    })
    await seedInvoiceItem({
      invoiceId: invoice9amSecond,
      productId,
      productName: "Widget",
      unitPrice: 50,
      quantity: 1,
      lineTotal: 50,
    })

    const invoice2pm = await seedInvoice({
      organizationId: actor.organizationId,
      workspaceId,
      subtotal: 60,
      tax: 0,
      total: 60,
      createdAt: "2026-01-10T14:00:00.000Z",
    })
    await seedInvoiceItem({
      invoiceId: invoice2pm,
      productId,
      productName: "Widget",
      unitPrice: 20,
      quantity: 3,
      lineTotal: 60,
    })

    const singleDayRange = `from=2026-01-10T00:00:00.000Z&to=2026-01-11T00:00:00.000Z`
    const response = await fetch(`${baseUrl}/v1/reports/ready/sales-movement?${singleDayRange}`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      kpis: {
        totalSales: { value: number; changePercent: number | null }
        invoiceCount: { value: number; changePercent: number | null }
        itemsSold: { value: number; changePercent: number | null }
        avgInvoiceValue: { value: number; changePercent: number | null }
      }
      hours: Array<{
        hour: number
        invoiceCount: number
        totalSales: number
        itemsSold: number
        avgInvoiceValue: number
      }>
    }

    expect(body.hours).toHaveLength(24)
    const hour9 = body.hours.find((row) => row.hour === 9)
    const hour14 = body.hours.find((row) => row.hour === 14)
    const hour0 = body.hours.find((row) => row.hour === 0)

    expect(hour9).toMatchObject({
      invoiceCount: 2,
      totalSales: 150,
      itemsSold: 3,
      avgInvoiceValue: 75,
    })
    expect(hour14).toMatchObject({ invoiceCount: 1, totalSales: 60, itemsSold: 3 })
    expect(hour0).toMatchObject({ invoiceCount: 0, totalSales: 0, itemsSold: 0 })

    expect(body.kpis.totalSales.value).toBe(210)
    expect(body.kpis.invoiceCount.value).toBe(3)
    expect(body.kpis.itemsSold.value).toBe(6)
    // No invoices exist in the equal-length preceding day -- changePercent() returns null rather
    // than divide by zero.
    expect(body.kpis.totalSales.changePercent).toBeNull()
  })

  it("groups sales by branch with contribution percentages", async () => {
    const orgOwner = await signIn("owner-sales-by-branch@example.com", "Branch Org")
    const { token, actor } = orgOwner
    const mainWorkspaceId = actor.workspaceId as string
    const secondWorkspaceId = await seedWorkspace(actor.organizationId, "Second Branch")
    const productId = await seedProduct(actor.organizationId, "Widget", 0)

    const mainInvoice = await seedInvoice({
      organizationId: actor.organizationId,
      workspaceId: mainWorkspaceId,
      subtotal: 300,
      tax: 0,
      total: 300,
      createdAt: "2026-01-10T10:00:00.000Z",
    })
    await seedInvoiceItem({
      invoiceId: mainInvoice,
      productId,
      productName: "Widget",
      unitPrice: 100,
      quantity: 3,
      lineTotal: 300,
    })

    const secondInvoice = await seedInvoice({
      organizationId: actor.organizationId,
      workspaceId: secondWorkspaceId,
      subtotal: 100,
      tax: 0,
      total: 100,
      createdAt: "2026-01-11T10:00:00.000Z",
    })
    await seedInvoiceItem({
      invoiceId: secondInvoice,
      productId,
      productName: "Widget",
      unitPrice: 50,
      quantity: 2,
      lineTotal: 100,
    })

    const response = await fetch(`${baseUrl}/v1/reports/ready/sales-by-branch?${RANGE}`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      kpis: { totalSales: number; itemsSold: number; avgInvoiceValue: number; orderCount: number }
      branches: Array<{
        workspaceId: string
        totalSales: number
        orderCount: number
        itemsSold: number
        contributionPercent: number
      }>
    }

    expect(body.branches).toHaveLength(2)
    const mainBranch = body.branches.find((branch) => branch.workspaceId === mainWorkspaceId)
    const secondBranch = body.branches.find((branch) => branch.workspaceId === secondWorkspaceId)

    expect(mainBranch).toMatchObject({ totalSales: 300, orderCount: 1, itemsSold: 3 })
    expect(mainBranch?.contributionPercent).toBeCloseTo(75, 5)
    expect(secondBranch).toMatchObject({ totalSales: 100, orderCount: 1, itemsSold: 2 })
    expect(secondBranch?.contributionPercent).toBeCloseTo(25, 5)

    expect(body.kpis).toEqual({
      totalSales: 400,
      itemsSold: 5,
      avgInvoiceValue: 200,
      orderCount: 2,
    })
  })

  // A dedicated "missing expenses:view still has reports:view -> 403 on net-income" test isn't
  // feasible on this harness: a freshly-registered owner always resolves full permissions (no
  // invitation endpoint exists here to create a second, lower-privileged real actor -- see the
  // identical, already-documented limitation in expenses.http.test.ts). The
  // `actor.modulePermissions.includes("expenses:view")` check is the same one-line shape used by
  // every other permission-gated route in server.ts.
})
