// @vitest-environment node

// POS, Ads and E-commerce routes answer only for an organization subscribed to the app they
// belong to (subscriptions/app-access.ts) -- the same flags the sidebar shows them by.
import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ApplicationAccessService, applicationsForPath } from "../subscriptions/app-access"

const ORG = "20000000-0000-0000-0000-000000000001"
let database: PostgresDatabase
let access: ApplicationAccessService

beforeEach(async () => {
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ('10000000-0000-0000-0000-000000000001', 'o@x.com', 'h', 'Owner', now())`
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id)
     values ($1, 'Org', '10000000-0000-0000-0000-000000000001')`,
    [ORG]
  )
  access = new ApplicationAccessService(database)
})

afterEach(async () => {
  await database.end()
})

const setSettings = (settings: Record<string, unknown>) =>
  database.query("update organizations set settings = $2 where id = $1", [
    ORG,
    JSON.stringify(settings),
  ])

const allowed = async (path: string) =>
  access.requireForPath(ORG, path).then(
    () => true,
    (error: { code?: string }) => {
      expect(error.code).toBe("APPLICATION_NOT_SUBSCRIBED")
      return false
    }
  )

describe("applicationsForPath", () => {
  it("maps each route to the apps that may use it", () => {
    expect(applicationsForPath("/v1/pos/shifts")).toEqual(["pos"])
    expect(applicationsForPath("/v1/pos/invoices/abc/returns")).toEqual(["pos", "ecommerce"])
    expect(applicationsForPath("/v1/products")).toEqual(["pos", "ecommerce", "procurement"])
    expect(applicationsForPath("/v1/products/lookup-by-sku")).toEqual([
      "pos",
      "ecommerce",
      "procurement",
    ])
    expect(applicationsForPath("/v1/orders/by-store")).toEqual(["ecommerce"])
    expect(applicationsForPath("/v1/tracking/live-visitors")).toEqual(["ecommerce"])
    expect(applicationsForPath("/v1/campaigns/performance/summary")).toEqual(["advertising"])
    // Not app routes: open to any organization.
    expect(applicationsForPath("/v1/reports/ready/sales-movement")).toBeNull()
    expect(applicationsForPath("/v1/workspaces")).toBeNull()
    expect(applicationsForPath("/v1/tracking/capture")).toBeNull()
    // Linking a store installed from Zid / Salla is how a merchant signs up.
    expect(applicationsForPath("/v1/integrations/zid/install/xyz/claim")).toBeNull()
    expect(applicationsForPath("/v1/integrations/zid/oauth/start")).toEqual([
      "advertising",
      "ecommerce",
    ])
  })
})

describe("ApplicationAccessService", () => {
  it("refuses an app's routes until the organization subscribes to it", async () => {
    expect(await allowed("/v1/pos/shifts")).toBe(false)
    expect(await allowed("/v1/orders")).toBe(false)
    expect(await allowed("/v1/reports/ready/pos-summary")).toBe(true)

    // E-commerce alone: its own routes and the shared invoices -- not the cashier.
    await setSettings({ ecommerceEnabled: true })
    expect(await allowed("/v1/orders")).toBe(true)
    expect(await allowed("/v1/pos/invoices")).toBe(true)
    expect(await allowed("/v1/pos/shifts")).toBe(false)
    expect(await allowed("/v1/campaigns")).toBe(false)

    // Supplies alone still reaches the product list purchases need.
    await setSettings({ procurementEnabled: true })
    expect(await allowed("/v1/products")).toBe(true)
    expect(await allowed("/v1/pos/invoices")).toBe(false)
  })

  it("treats a lapsed trial as not subscribed", async () => {
    await setSettings({ posEnabled: true, posTrialEndsAt: "2026-01-01T00:00:00.000Z" })
    expect(await allowed("/v1/pos/shifts")).toBe(false)
    await setSettings({
      posEnabled: true,
      posTrialEndsAt: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(await allowed("/v1/pos/shifts")).toBe(true)
  })
})
