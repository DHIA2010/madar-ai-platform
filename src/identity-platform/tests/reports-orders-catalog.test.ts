// @vitest-environment node
//
// Proves the new "orders" catalog data source (reports/catalog.ts) -- the Universal Data
// Intelligence audit's Step 2: extending the existing generic query engine (executeKpi) to
// e-commerce without touching the engine itself. This is the highest-risk piece of that step: a
// hand-written SQL UNION across three differently-shaped JSONB payloads (Salla/Shopify/Zid), so
// it is proven empirically against real seeded rows rather than assumed correct from reading the
// SQL.

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { executeKpi } from "../reports/query-builder"

let database: PostgresDatabase

const ORG_A = randomUUID()
const ORG_B = randomUUID()
const USER = randomUUID()
const WORKSPACE_A = randomUUID()

async function insertSallaOrder(input: {
  organizationId: string
  workspaceId: string | null
  amount: number
  status: string
  customerName: string
  recordDate: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,'connected',$5,$5,now(),now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), USER]
  )
  await database.query(
    `insert into salla_records (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1,$2,'store-1','orders',$3,$4::date,$5::jsonb,now(),$4::timestamptz)`,
    [
      randomUUID(),
      connectionId,
      `salla-${randomUUID().slice(0, 8)}`,
      input.recordDate,
      JSON.stringify({
        total: { amount: input.amount, currency: "SAR" },
        status: { name: input.status },
        customer: { full_name: input.customerName },
      }),
    ]
  )
}

async function insertShopifyOrder(input: {
  organizationId: string
  workspaceId: string | null
  amount: number
  recordDate: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into shopify_oauth_connections (
       id, organization_id, workspace_id, project_id, shop_domain, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,'test-shop.myshopify.com','connected',$5,$5,now(),now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), USER]
  )
  await database.query(
    `insert into shopify_records (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1,$2,'store-1','orders',$3,$4::date,$5::jsonb,now(),$4::timestamptz)`,
    [
      randomUUID(),
      connectionId,
      `shopify-${randomUUID().slice(0, 8)}`,
      input.recordDate,
      JSON.stringify({
        total_price: String(input.amount),
        fulfillment_status: "fulfilled",
        customer: { first_name: "Sara", last_name: "Ahmed" },
      }),
    ]
  )
}

async function insertZidOrder(input: {
  organizationId: string
  workspaceId: string | null
  amount: number
  recordDate: string
}) {
  const connectionId = randomUUID()
  await database.query(
    `insert into zid_oauth_connections (
       id, organization_id, workspace_id, project_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1,$2,$3,$4,'connected',$5,$5,now(),now())`,
    [connectionId, input.organizationId, input.workspaceId, randomUUID(), USER]
  )
  await database.query(
    `insert into zid_records (
       id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
     ) values ($1,$2,'store-1','orders',$3,$4::date,$5::jsonb,now(),$4::timestamptz)`,
    [
      randomUUID(),
      connectionId,
      `zid-${randomUUID().slice(0, 8)}`,
      input.recordDate,
      JSON.stringify({
        order_total: String(input.amount),
        order_status: { name: "Delivered" },
        customer: { name: "Khaled" },
      }),
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
     values ($1, 'orders-catalog-test@madar.test', 'hash', 'Test', now())`,
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
})

describe("reports catalog -- orders data source (Salla/Shopify/Zid union)", () => {
  it("sums revenue correctly across all three providers, with each provider's own amount field correctly cast", async () => {
    await insertSallaOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 250,
      status: "Completed",
      customerName: "Ahmed",
      recordDate: "2026-09-15",
    })
    await insertShopifyOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 180.5,
      recordDate: "2026-09-16",
    })
    await insertZidOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 95,
      recordDate: "2026-09-17",
    })

    const result = await executeKpi(
      database,
      ORG_A,
      WORKSPACE_A,
      {
        dataSource: "orders",
        field: "revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: null,
        compareEnabled: false,
      },
      { from: "2026-09-01", to: "2026-10-01" }
    )

    expect(result.currentValue).toBe(525.5)
  })

  it("counts orders correctly across providers", async () => {
    await insertSallaOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 100,
      status: "Completed",
      customerName: "A",
      recordDate: "2026-09-15",
    })
    await insertShopifyOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 100,
      recordDate: "2026-09-15",
    })

    const result = await executeKpi(
      database,
      ORG_A,
      WORKSPACE_A,
      {
        dataSource: "orders",
        field: "order_count",
        aggregation: "count",
        filters: [],
        timeGrouping: "none",
        groupByDimension: null,
        compareEnabled: false,
      },
      { from: "2026-09-01", to: "2026-10-01" }
    )

    expect(result.currentValue).toBe(2)
  })

  it("groups by platform correctly, ranking revenue per provider", async () => {
    await insertSallaOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 500,
      status: "Completed",
      customerName: "A",
      recordDate: "2026-09-15",
    })
    await insertShopifyOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 100,
      recordDate: "2026-09-15",
    })

    const result = await executeKpi(
      database,
      ORG_A,
      WORKSPACE_A,
      {
        dataSource: "orders",
        field: "revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: "platform",
        compareEnabled: false,
      },
      { from: "2026-09-01", to: "2026-10-01" }
    )

    expect(result.points[0]).toEqual({ label: "Salla", value: 500 })
    expect(result.points[1]).toEqual({ label: "Shopify", value: 100 })
  })

  it("never includes another organization's orders", async () => {
    await insertSallaOrder({
      organizationId: ORG_B,
      workspaceId: null,
      amount: 999,
      status: "Completed",
      customerName: "Other Org",
      recordDate: "2026-09-15",
    })

    const result = await executeKpi(
      database,
      ORG_A,
      WORKSPACE_A,
      {
        dataSource: "orders",
        field: "revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: null,
        compareEnabled: false,
      },
      { from: "2026-09-01", to: "2026-10-01" }
    )

    expect(result.currentValue).toBe(0)
  })

  it("filters by the raw provider status text", async () => {
    await insertSallaOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 200,
      status: "Completed",
      customerName: "A",
      recordDate: "2026-09-15",
    })
    await insertSallaOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 300,
      status: "Cancelled",
      customerName: "B",
      recordDate: "2026-09-16",
    })

    const result = await executeKpi(
      database,
      ORG_A,
      WORKSPACE_A,
      {
        dataSource: "orders",
        field: "revenue",
        aggregation: "sum",
        filters: [{ field: "status", operator: "eq", value: "Completed" }],
        timeGrouping: "none",
        groupByDimension: null,
        compareEnabled: false,
      },
      { from: "2026-09-01", to: "2026-10-01" }
    )

    expect(result.currentValue).toBe(200)
  })

  it("excludes orders outside the requested date range", async () => {
    await insertSallaOrder({
      organizationId: ORG_A,
      workspaceId: WORKSPACE_A,
      amount: 400,
      status: "Completed",
      customerName: "A",
      recordDate: "2026-01-01",
    })

    const result = await executeKpi(
      database,
      ORG_A,
      WORKSPACE_A,
      {
        dataSource: "orders",
        field: "revenue",
        aggregation: "sum",
        filters: [],
        timeGrouping: "none",
        groupByDimension: null,
        compareEnabled: false,
      },
      { from: "2026-09-01", to: "2026-10-01" }
    )

    expect(result.currentValue).toBe(0)
  })
})
