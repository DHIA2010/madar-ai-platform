// @vitest-environment node
//
// Proves PosInvoicesService.getDateCoverage against real pos_invoices rows -- straightforward
// MIN(created_at)/MAX(created_at), no row-limit or aggregation pitfalls the way the advertising/
// e-commerce equivalents had (see campaigns-date-coverage.test.ts / orders-date-coverage.test.ts),
// since this queries the raw transactional table directly.

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PosInvoicesService } from "../pos/invoices-service"
import { PosPaymentMethodsService } from "../pos/payment-methods-service"
import { TaxRatesService } from "../tax/tax-rates-service"

let database: PostgresDatabase
let invoicesService: PosInvoicesService

const ORG_A = randomUUID()
const ORG_B = randomUUID()
const USER = randomUUID()
const WORKSPACE_A = randomUUID()
const WORKSPACE_B = randomUUID()

async function seedInvoiceAt(input: {
  organizationId: string
  workspaceId: string
  totalAmount: number
  createdAt: string
}) {
  await database.query(
    `insert into pos_invoices (
      id, organization_id, workspace_id, invoice_number, status, payment_method_code,
      subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
    ) values ($1,$2,$3,$4,'completed','cash',$5,0,0,$5,$6,$6)`,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      `INV-${randomUUID().slice(0, 8)}`,
      input.totalAmount,
      input.createdAt,
    ]
  )
}

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'pos-date-coverage-test@madar.test', 'hash', 'Test', now())`,
    [USER]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org A', $2, 'active')`,
    [ORG_A, USER]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org B', $2, 'active')`,
    [ORG_B, USER]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [WORKSPACE_A, ORG_A]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [WORKSPACE_B, ORG_B]
  )

  const paymentMethodsService = new PosPaymentMethodsService(database)
  const taxRatesService = new TaxRatesService(database)
  invoicesService = new PosInvoicesService(database, paymentMethodsService, taxRatesService)
})

describe("PosInvoicesService.getDateCoverage", () => {
  it("returns the real earliest/latest invoice date, not an assumed range", async () => {
    await seedInvoiceAt({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 100,
      createdAt: "2025-02-10T10:00:00Z",
    })
    await seedInvoiceAt({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 200,
      createdAt: "2026-09-30T10:00:00Z",
    })
    await seedInvoiceAt({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 150,
      createdAt: "2025-11-05T10:00:00Z",
    })

    const coverage = await invoicesService.getDateCoverage(ORG_A, WORKSPACE_A)
    expect(coverage.earliestDate).toBe("2025-02-10")
    expect(coverage.latestDate).toBe("2026-09-30")
  })

  it("never returns another organization's invoice coverage", async () => {
    await seedInvoiceAt({
      organizationId: ORG_B,
      workspaceId: WORKSPACE_B,
      totalAmount: 500,
      createdAt: "2020-01-01T00:00:00Z",
    })
    const coverage = await invoicesService.getDateCoverage(ORG_A, WORKSPACE_A)
    expect(coverage.earliestDate).toBeNull()
    expect(coverage.latestDate).toBeNull()
  })

  it("returns null/null when the organization has no invoices at all", async () => {
    const coverage = await invoicesService.getDateCoverage(ORG_A, WORKSPACE_A)
    expect(coverage.earliestDate).toBeNull()
    expect(coverage.latestDate).toBeNull()
  })
})
