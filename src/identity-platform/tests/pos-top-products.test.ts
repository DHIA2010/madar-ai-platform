// @vitest-environment node

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { PosInvoicesService } from "../pos/invoices-service"
import { PosPaymentMethodsService } from "../pos/payment-methods-service"
import { TaxRatesService } from "../tax/tax-rates-service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

let database: PostgresDatabase
let service: PosInvoicesService

const ORG = randomUUID()
const ORG_B = randomUUID()
const USER = randomUUID()
const WORKSPACE = randomUUID()
const WORKSPACE_B = randomUUID()

async function seedInvoiceWithItems(input: {
  organizationId: string
  workspaceId: string | null
  status: "completed" | "cancelled" | "returned"
  createdAt: string
  items: Array<{
    productId: string | null
    productName: string
    unitPrice: number
    quantity: number
  }>
}) {
  const invoiceId = randomUUID()
  const total = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  await database.query(
    `insert into pos_invoices (
      id, organization_id, workspace_id, invoice_number, status, payment_method_code,
      subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,'cash',$6,0,0,$6,$7,$7)`,
    [
      invoiceId,
      input.organizationId,
      input.workspaceId,
      `INV-${invoiceId.slice(0, 8)}`,
      input.status,
      total,
      input.createdAt,
    ]
  )
  for (const item of input.items) {
    await database.query(
      `insert into pos_invoice_items (id, invoice_id, product_id, product_name, unit_price, quantity, line_total)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        randomUUID(),
        invoiceId,
        item.productId,
        item.productName,
        item.unitPrice,
        item.quantity,
        item.unitPrice * item.quantity,
      ]
    )
  }
  return invoiceId
}

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'pos-top-products-test@madar.test', 'hash', 'Test', now())`,
    [USER]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org', $2, 'active')`,
    [ORG, USER]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org B', $2, 'active')`,
    [ORG_B, USER]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [WORKSPACE, ORG]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [WORKSPACE_B, ORG_B]
  )

  service = new PosInvoicesService(
    database,
    new PosPaymentMethodsService(database),
    new TaxRatesService(database)
  )
})

describe("PosInvoicesService.topProducts", () => {
  it("ranks products by revenue across multiple invoices", async () => {
    await seedInvoiceWithItems({
      organizationId: ORG,
      workspaceId: WORKSPACE,
      status: "completed",
      createdAt: "2026-09-10T10:00:00Z",
      items: [
        { productId: "p1", productName: "Product A", unitPrice: 100, quantity: 5 },
        { productId: "p2", productName: "Product B", unitPrice: 10, quantity: 2 },
      ],
    })
    await seedInvoiceWithItems({
      organizationId: ORG,
      workspaceId: WORKSPACE,
      status: "completed",
      createdAt: "2026-09-20T10:00:00Z",
      items: [{ productId: "p1", productName: "Product A", unitPrice: 100, quantity: 3 }],
    })

    const results = await service.topProducts(ORG, {
      workspaceId: null,
      from: "2026-09-01",
      to: "2026-09-30",
      limit: 10,
    })

    expect(results[0].productId).toBe("p1")
    expect(results[0].quantitySold).toBe(8)
    expect(results[0].revenue).toBe(800)
    expect(results[0].invoiceCount).toBe(2)
    expect(results[1].productId).toBe("p2")
  })

  it("excludes cancelled/returned invoices -- only completed sales count as sold", async () => {
    await seedInvoiceWithItems({
      organizationId: ORG,
      workspaceId: WORKSPACE,
      status: "cancelled",
      createdAt: "2026-09-10T10:00:00Z",
      items: [{ productId: "p1", productName: "Product A", unitPrice: 100, quantity: 5 }],
    })

    const results = await service.topProducts(ORG, {
      workspaceId: null,
      from: "2026-09-01",
      to: "2026-09-30",
      limit: 10,
    })
    expect(results).toHaveLength(0)
  })

  it("groups free-text items with no product_id by name instead of collapsing them together", async () => {
    await seedInvoiceWithItems({
      organizationId: ORG,
      workspaceId: WORKSPACE,
      status: "completed",
      createdAt: "2026-09-10T10:00:00Z",
      items: [
        { productId: null, productName: "Custom Item X", unitPrice: 20, quantity: 1 },
        { productId: null, productName: "Custom Item Y", unitPrice: 30, quantity: 1 },
      ],
    })

    const results = await service.topProducts(ORG, {
      workspaceId: null,
      from: "2026-09-01",
      to: "2026-09-30",
      limit: 10,
    })
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.productName).sort()).toEqual(["Custom Item X", "Custom Item Y"])
  })

  it("never leaks another organization's product sales", async () => {
    await seedInvoiceWithItems({
      organizationId: ORG_B,
      workspaceId: WORKSPACE_B,
      status: "completed",
      createdAt: "2026-09-10T10:00:00Z",
      items: [{ productId: "p1", productName: "Org B Product", unitPrice: 999, quantity: 1 }],
    })

    const results = await service.topProducts(ORG, {
      workspaceId: null,
      from: "2026-09-01",
      to: "2026-09-30",
      limit: 10,
    })
    expect(results).toHaveLength(0)
  })
})
