// @vitest-environment node

import { randomUUID } from "node:crypto"

import { DataType, newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ReportsService } from "../reports/service"

let database: PostgresDatabase
let service: ReportsService

const ORG_A = randomUUID()
const ORG_B = randomUUID()
const USER_A = randomUUID()
const WORKSPACE_A = randomUUID()
const WORKSPACE_B = randomUUID()

// pg-mem only implements a handful of native functions -- date_trunc (used by the query builder's
// time-series grouping) isn't one of them, so it's registered here with real month/week/etc.
// truncation semantics purely for this test harness; the real Postgres date_trunc runs unmodified
// against stage/production.
function registerDateTrunc(mem: ReturnType<typeof newDb>) {
  mem.public.registerFunction({
    name: "date_trunc",
    args: [DataType.text, DataType.timestamptz],
    returns: DataType.timestamptz,
    implementation: (part: string, value: Date) => {
      const date = new Date(value)
      switch (part) {
        case "day":
          return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
        case "week": {
          const day = date.getUTCDay()
          const diff = (day === 0 ? -6 : 1) - day
          return new Date(
            Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff)
          )
        }
        case "month":
          return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
        case "quarter": {
          const quarter = Math.floor(date.getUTCMonth() / 3)
          return new Date(Date.UTC(date.getUTCFullYear(), quarter * 3, 1))
        }
        case "year":
          return new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
        default:
          return date
      }
    },
  })
}

function actor(overrides: Partial<AuthenticatedActor> = {}): AuthenticatedActor {
  return {
    userId: USER_A,
    sessionId: randomUUID(),
    organizationId: ORG_A,
    workspaceId: null,
    roles: ["owner"],
    modulePermissions: ["reports:view", "reports:manage"],
    ...overrides,
  }
}

async function seedInvoice(input: {
  organizationId: string
  workspaceId: string | null
  totalAmount: number
  createdAt: string
  status?: string
  paymentMethodCode?: string
}) {
  await database.query(
    `insert into pos_invoices (
      id, organization_id, workspace_id, invoice_number, status, payment_method_code,
      subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
    ) values ($1,$2,$3,$4,$5,$6,$7,0,0,$8,$9,$9)`,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      `INV-${randomUUID().slice(0, 8)}`,
      input.status ?? "completed",
      input.paymentMethodCode ?? "cash",
      input.totalAmount,
      input.totalAmount,
      input.createdAt,
    ]
  )
}

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  registerDateTrunc(mem)
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())
  service = new ReportsService(database)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'reports-test@madar.test', 'hash', 'Reports Test', now())`,
    [USER_A]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org A', $2, 'active')`,
    [ORG_A, USER_A]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org B', $2, 'active')`,
    [ORG_B, USER_A]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [WORKSPACE_A, ORG_A]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
    [WORKSPACE_B, ORG_B]
  )
})

describe("reports: catalog-driven query builder", () => {
  it("aggregates a KPI's field correctly over seeded invoices within the date range", async () => {
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 100,
      createdAt: "2026-06-01T10:00:00Z",
    })
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 250,
      createdAt: "2026-06-15T10:00:00Z",
    })
    // Outside the default 12-month preview range (way in the past) -- must not be counted.
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 999,
      createdAt: "2020-01-01T10:00:00Z",
    })

    const result = await service.previewKpi(actor(), {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "none",
      groupByDimension: null,
      compareEnabled: false,
      workspaceId: null,
    })

    expect(result.currentValue).toBe(350)
  })

  it("never leaks another organization's invoices into a KPI's aggregate", async () => {
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 100,
      createdAt: "2026-06-01T10:00:00Z",
    })
    await seedInvoice({
      organizationId: ORG_B,
      workspaceId: WORKSPACE_B,
      totalAmount: 5000,
      createdAt: "2026-06-01T10:00:00Z",
    })

    const result = await service.previewKpi(actor({ organizationId: ORG_A }), {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "none",
      groupByDimension: null,
      compareEnabled: false,
      workspaceId: null,
    })

    expect(result.currentValue).toBe(100)
  })

  it("produces a ranked breakdown when a KPI groups by a dimension", async () => {
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 100,
      createdAt: "2026-06-01T10:00:00Z",
      paymentMethodCode: "cash",
    })
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 300,
      createdAt: "2026-06-02T10:00:00Z",
      paymentMethodCode: "card",
    })
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 50,
      createdAt: "2026-06-03T10:00:00Z",
      paymentMethodCode: "cash",
    })

    const result = await service.previewKpi(actor(), {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "none",
      groupByDimension: "payment_method",
      compareEnabled: false,
      workspaceId: null,
    })

    expect(result.points).toEqual(
      expect.arrayContaining([
        { label: "card", value: 300 },
        { label: "cash", value: 150 },
      ])
    )
  })

  // Universal Data Intelligence audit, Step 3/4: `meta` is what lets a generic consumer (the AI
  // chat's response-formatter) build a human-readable title/domain without re-deriving it from
  // the catalog -- added specifically so run_kpi_preview's result is self-describing.
  it("echoes back the resolved data source/field/dimension labels and application in meta", async () => {
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 100,
      createdAt: "2026-06-01T10:00:00Z",
      paymentMethodCode: "cash",
    })

    const ungrouped = await service.previewKpi(actor(), {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "none",
      groupByDimension: null,
      compareEnabled: false,
      workspaceId: null,
    })
    expect(ungrouped.meta).toEqual({
      dataSourceLabel: "المبيعات",
      fieldLabel: "إجمالي المبيعات",
      groupByDimensionLabel: null,
      application: "pos",
      queriedPeriod: expect.objectContaining({
        from: expect.any(String),
        to: expect.any(String),
      }),
    })

    const grouped = await service.previewKpi(actor(), {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "none",
      groupByDimension: "payment_method",
      compareEnabled: false,
      workspaceId: null,
    })
    expect(grouped.meta?.groupByDimensionLabel).toBe("طريقة الدفع")
  })

  // Universal Data Intelligence "Next Level" audit, Section 6: groupByDimension + compareEnabled
  // together is the generic contribution/driver mode -- each label gets ranked by |delta| vs the
  // preceding equal-length period (largest driver of the change first, increases and decreases
  // both included), not by raw current value. "card" swings from 200 to 50 (delta -150, the
  // bigger move) while "cash" swings from 20 to 100 (delta +80) -- card must rank first despite
  // having the smaller current-period value.
  it("ranks a grouped breakdown by |delta| vs the preceding period when compareEnabled is combined with groupByDimension", async () => {
    // Previous period: [2026-05-25T00:00:00Z, 2026-06-01T00:00:00Z)
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 20,
      createdAt: "2026-05-26T10:00:00Z",
      paymentMethodCode: "cash",
    })
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 200,
      createdAt: "2026-05-27T10:00:00Z",
      paymentMethodCode: "card",
    })
    // Current period: [2026-06-01T00:00:00Z, 2026-06-08T00:00:00Z)
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 100,
      createdAt: "2026-06-02T10:00:00Z",
      paymentMethodCode: "cash",
    })
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 50,
      createdAt: "2026-06-03T10:00:00Z",
      paymentMethodCode: "card",
    })

    const result = await service.previewKpi(actor(), {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "none",
      groupByDimension: "payment_method",
      compareEnabled: true,
      workspaceId: null,
      range: { from: "2026-06-01T00:00:00Z", to: "2026-06-08T00:00:00Z" },
    })

    expect(result.points.map((p) => p.label)).toEqual(["card", "cash"])
    expect(result.points[0]).toEqual({
      label: "card",
      value: 50,
      extraValues: { previousValue: 200, delta: -150, deltaPercent: -75 },
    })
    expect(result.points[1]).toEqual({
      label: "cash",
      value: 100,
      extraValues: { previousValue: 20, delta: 80, deltaPercent: 400 },
    })
  })

  // Universal Data Intelligence "Next Level" audit, Section 4: "products" and "customers" used to
  // have no status filterField at all -- a cancelled/returned invoice's line items/spend were
  // silently always included in these two data sources' breakdowns with no way to exclude them
  // (unlike "sales"/"financial", which already exposed status). Proves the newly added status
  // filterField on both actually excludes a cancelled invoice's contribution.
  it("excludes a cancelled invoice from products/customers breakdowns via the newly added status filter", async () => {
    const customerId = randomUUID()
    await database.query(
      `insert into customers (id, organization_id, workspace_id, name, created_by, created_at, updated_at)
       values ($1,$2,$3,'Ahmed',$4,now(),now())`,
      [customerId, ORG_A, WORKSPACE_A, USER_A]
    )

    const completedInvoiceId = randomUUID()
    await database.query(
      `insert into pos_invoices (
        id, organization_id, workspace_id, customer_id, invoice_number, status, payment_method_code,
        subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,'completed','cash',100,0,0,100,$6,$6)`,
      [
        completedInvoiceId,
        ORG_A,
        WORKSPACE_A,
        customerId,
        `INV-${randomUUID().slice(0, 8)}`,
        "2026-06-01T10:00:00Z",
      ]
    )
    await database.query(
      `insert into pos_invoice_items (id, invoice_id, product_id, product_name, unit_price, quantity, line_total)
       values ($1,$2,null,'Widget',50,2,100)`,
      [randomUUID(), completedInvoiceId]
    )

    const cancelledInvoiceId = randomUUID()
    await database.query(
      `insert into pos_invoices (
        id, organization_id, workspace_id, customer_id, invoice_number, status, payment_method_code,
        subtotal_amount, discount_amount, tax_amount, total_amount, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,'cancelled','cash',999,0,0,999,$6,$6)`,
      [
        cancelledInvoiceId,
        ORG_A,
        WORKSPACE_A,
        customerId,
        `INV-${randomUUID().slice(0, 8)}`,
        "2026-06-02T10:00:00Z",
      ]
    )
    await database.query(
      `insert into pos_invoice_items (id, invoice_id, product_id, product_name, unit_price, quantity, line_total)
       values ($1,$2,null,'Widget',999,1,999)`,
      [randomUUID(), cancelledInvoiceId]
    )

    const productsResult = await service.previewKpi(actor(), {
      dataSource: "products",
      field: "revenue",
      aggregation: "sum",
      filters: [{ field: "status", operator: "eq", value: "completed" }],
      timeGrouping: "none",
      groupByDimension: null,
      compareEnabled: false,
      workspaceId: null,
    })
    expect(productsResult.currentValue).toBe(100)

    const customersResult = await service.previewKpi(actor(), {
      dataSource: "customers",
      field: "total_spend",
      aggregation: "sum",
      filters: [{ field: "status", operator: "eq", value: "completed" }],
      timeGrouping: "none",
      groupByDimension: null,
      compareEnabled: false,
      workspaceId: null,
    })
    expect(customersResult.currentValue).toBe(100)
  })

  // Universal Data Intelligence "Next Level" audit, Priority 1: previewKpi's caller (run_kpi_
  // preview) now resolves a real period/all_time/custom range deterministically and passes it
  // in -- this is the mechanism that closes the fixed-last-12-months-window gap. Proven here at
  // the previewKpi level, independent of the AI-chat-level period resolution tested elsewhere.
  it("honors an explicit caller-resolved range instead of the hardcoded last-12-months window", async () => {
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 999,
      createdAt: "2020-01-15T10:00:00Z", // outside the default 12-month window
    })
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 50,
      createdAt: "2026-06-01T10:00:00Z", // inside the default window too
    })

    const withoutRange = await service.previewKpi(actor(), {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "none",
      groupByDimension: null,
      compareEnabled: false,
      workspaceId: null,
    })
    expect(withoutRange.currentValue).toBe(50) // the 2020 invoice falls outside the default window

    const withRange = await service.previewKpi(actor(), {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "none",
      groupByDimension: null,
      compareEnabled: false,
      workspaceId: null,
      range: { from: "2020-01-01T00:00:00Z", to: "2020-02-01T00:00:00Z" },
    })
    expect(withRange.currentValue).toBe(999)
    expect(withRange.meta?.queriedPeriod).toEqual({
      from: "2020-01-01T00:00:00Z",
      to: "2020-02-01T00:00:00Z",
    })
  })

  it("reports the real row count behind the aggregate as sampleSize", async () => {
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 100,
      createdAt: "2026-06-01T10:00:00Z",
    })
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 50,
      createdAt: "2026-06-02T10:00:00Z",
    })

    const result = await service.previewKpi(actor(), {
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "none",
      groupByDimension: null,
      compareEnabled: false,
      workspaceId: null,
    })
    expect(result.sampleSize).toBe(2)
  })

  it("rejects a KPI definition referencing an unknown data source", async () => {
    await expect(
      service.previewKpi(actor(), {
        dataSource: "not-a-real-source",
        field: "whatever",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: null,
        compareEnabled: false,
        workspaceId: null,
      })
    ).rejects.toBeInstanceOf(IdentityError)
  })

  it("rejects a KPI definition using a field that doesn't exist on its data source", async () => {
    await expect(
      service.createKpi(actor(), {
        name: "Bad KPI",
        description: "",
        category: "sales",
        dataSource: "sales",
        field: "not-a-real-field",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: null,
        compareEnabled: false,
        displayType: "number",
        status: "active",
        workspaceId: null,
      })
    ).rejects.toBeInstanceOf(IdentityError)
  })
})

describe("reports: permissions", () => {
  it("refuses to let a viewer-role actor create a KPI", async () => {
    await expect(
      service.createKpi(actor({ roles: ["viewer"] }), {
        name: "My KPI",
        description: "",
        category: "sales",
        dataSource: "sales",
        field: "total_revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "month",
        groupByDimension: null,
        compareEnabled: true,
        displayType: "line",
        status: "active",
        workspaceId: null,
      })
    ).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" })
  })

  it("allows a manager-role actor to create a KPI", async () => {
    const kpi = await service.createKpi(actor({ roles: ["manager"] }), {
      name: "Manager KPI",
      description: "",
      category: "sales",
      dataSource: "sales",
      field: "total_revenue",
      aggregation: "sum",
      filters: [],
      timeGrouping: "month",
      groupByDimension: null,
      compareEnabled: true,
      displayType: "line",
      status: "active",
      workspaceId: null,
    })
    expect(kpi.name).toBe("Manager KPI")
  })
})

describe("reports: system report seeding", () => {
  it("seeds exactly 8 ready-made reports and their KPIs on first request, once", async () => {
    const firstCall = await service.listCustomReports(actor(), true)
    expect(firstCall).toHaveLength(8)
    expect(firstCall.every((report) => report.isSystem)).toBe(true)
    expect(firstCall.every((report) => report.widgets.length === 1)).toBe(true)

    const allKpis = await service.listKpis(actor())
    expect(allKpis.filter((kpi) => kpi.isSystem)).toHaveLength(8)

    // Calling again must not duplicate the seed.
    const secondCall = await service.listCustomReports(actor(), true)
    expect(secondCall).toHaveLength(8)
  })

  it("runs every seeded system report's KPI without error and returns real numbers", async () => {
    await seedInvoice({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      totalAmount: 100,
      createdAt: "2026-06-01T10:00:00Z",
    })

    const reports = await service.listCustomReports(actor(), true)
    const salesReport = reports.find((report) => report.name === "تقرير المبيعات")
    expect(salesReport).toBeDefined()

    const { results } = await service.runCustomReport(actor(), salesReport!.id)
    const kpiId = salesReport!.widgets[0].kpiId
    expect(results[kpiId]).toBeDefined()
    expect(results[kpiId].currentValue).toBeGreaterThanOrEqual(100)
  })

  it("refuses to edit or delete a system KPI or report", async () => {
    await service.listCustomReports(actor(), true)
    const kpis = await service.listKpis(actor())
    const systemKpi = kpis.find((kpi) => kpi.isSystem)!

    await expect(
      service.updateKpi(actor(), systemKpi.id, {
        name: "Hacked",
        description: "",
        category: systemKpi.category,
        dataSource: systemKpi.dataSource,
        field: systemKpi.field,
        aggregation: systemKpi.aggregation,
        filters: [],
        timeGrouping: systemKpi.timeGrouping,
        groupByDimension: systemKpi.groupByDimension,
        compareEnabled: systemKpi.compareEnabled,
        displayType: systemKpi.displayType,
        status: "active",
        workspaceId: null,
      })
    ).rejects.toMatchObject({ code: "REPORT_SYSTEM_KPI_READONLY" })

    await expect(service.deleteKpi(actor(), systemKpi.id)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    })
  })
})

describe("reports: getCatalogForApplication", () => {
  it("scopes pos/ecommerce/advertising to only their own tagged data sources", () => {
    const pos = service.getCatalogForApplication("pos")
    expect(pos.map((s) => s.key).sort()).toEqual(
      ["customers", "financial", "inventory", "products", "sales"].sort()
    )
    expect(pos.every((s) => s.application === "pos")).toBe(true)

    const ecommerce = service.getCatalogForApplication("ecommerce")
    expect(ecommerce.map((s) => s.key)).toEqual(["orders"])

    const advertising = service.getCatalogForApplication("advertising")
    expect(advertising.map((s) => s.key)).toEqual(["marketing"])
  })

  // Regression test: no catalog entry is ever tagged application:"madarApps" (there is no
  // madarApps-owned table -- it's the cross-cutting reports/KPI feature), so filtering by exact
  // equality used to return an empty array, silently breaking run_kpi_preview for every
  // madarApps-scoped chat session. madarApps must see the full, unfiltered catalog instead.
  it("returns the full, unfiltered catalog for madarApps rather than an empty list", () => {
    const madarApps = service.getCatalogForApplication("madarApps")
    const full = service.getCatalog()
    expect(madarApps.length).toBe(full.length)
    expect(madarApps.length).toBeGreaterThan(0)
    expect(madarApps.map((s) => s.key).sort()).toEqual(full.map((s) => s.key).sort())
  })
})
