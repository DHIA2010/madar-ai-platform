// @vitest-environment node
//
// The Madar Admin console's backend (/v1/platform-admin/*): cross-tenant customers and
// subscriptions, and the grant/renew/cancel actions that keep organization_subscriptions and the
// organizations.settings access flags in step.

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

const STAFF_EMAIL = "staff@madar.test"

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

  container = createIdentityPlatform({
    mode: "memory",
    config: { platformAdminEmails: [STAFF_EMAIL] },
  })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  await database.end()
})

// Registers over HTTP, then mirrors the user/org rows into pg-mem (identity repositories are
// in-memory in this harness; the platform-admin service reads Postgres directly).
async function signIn(email: string, orgName: string, settings: Record<string, unknown> = {}) {
  const password = "VeryStrongPassword123!"
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      fullName: `${orgName} Owner`,
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
    body: JSON.stringify({ email, password }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', $3, now()) on conflict (id) do nothing`,
    [actor.userId, email, `${orgName} Owner`]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, $2, $3, 'active', $4::jsonb) on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId, JSON.stringify(settings)]
  )
  return { token: login.session.accessToken, actor }
}

function headers(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

async function get<T>(token: string, path: string) {
  const response = await fetch(`${baseUrl}/v1/platform-admin${path}`, { headers: headers(token) })
  return { status: response.status, body: (await response.json()) as T }
}

async function post<T>(token: string, path: string, body: unknown = {}) {
  const response = await fetch(`${baseUrl}/v1/platform-admin${path}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as T }
}

async function orgSettings(organizationId: string) {
  const result = await database.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1",
    [organizationId]
  )
  return result.rows[0]?.settings ?? {}
}

interface CustomerRow {
  id: string
  name: string
  status: string
  monthlyRevenueHalalas: number
  owner: { email: string } | null
  subscriptions: Array<{ id: string; application: string; status: string }>
}
interface SubscriptionView {
  id: string
  status: string
  currentPeriodEnd: string | null
  billingInterval: string | null
}

describe("platform admin: access", () => {
  it("refuses every route to anyone not on the platform-admin allowlist", async () => {
    const customer = await signIn("owner@shop.test", "Shop")
    expect((await get(customer.token, "/customers")).status).toBe(403)
    expect((await get(customer.token, "/subscriptions/summary")).status).toBe(403)
    expect(
      (
        await post(customer.token, `/customers/${customer.actor.organizationId}/subscriptions`, {
          application: "pos",
          interval: "monthly",
        })
      ).status
    ).toBe(403)
  })
})

describe("platform admin: customers and subscriptions", () => {
  it("lists every organization, deriving subscriptions from apps activated before they were recorded", async () => {
    const trialEndsAt = new Date(Date.now() + 5 * 86_400_000).toISOString()
    const trialing = await signIn("trial@shop.test", "Trial Shop", {
      posEnabled: true,
      posTrialEndsAt: trialEndsAt,
    })
    const lapsed = await signIn("lapsed@shop.test", "Lapsed Shop", {
      aiEnabled: true,
      aiTrialEndsAt: new Date(Date.now() - 86_400_000).toISOString(),
    })
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")

    const list = await get<{ items: CustomerRow[]; total: number }>(staff.token, "/customers")
    expect(list.status).toBe(200)
    const byName = Object.fromEntries(list.body.items.map((row) => [row.name, row]))
    expect(byName["Trial Shop"].status).toBe("trial")
    expect(byName["Trial Shop"].owner?.email).toBe("trial@shop.test")
    expect(byName["Lapsed Shop"].status).toBe("expired")
    expect(byName["Madar HQ"].status).toBe("none")

    const filtered = await get<{ items: CustomerRow[] }>(staff.token, "/customers?status=trial")
    expect(filtered.body.items.map((row) => row.id)).toEqual([trialing.actor.organizationId])

    const searched = await get<{ items: CustomerRow[] }>(staff.token, "/customers?search=lapsed@")
    expect(searched.body.items.map((row) => row.id)).toEqual([lapsed.actor.organizationId])

    const summary = await get<{ total: number; trial: number; renewingSoon: number }>(
      staff.token,
      "/customers/summary"
    )
    expect(summary.body).toMatchObject({ total: 3, trial: 1, renewingSoon: 1 })
  })

  it("grants, renews, and cancels a subscription, keeping the app's access flag in step", async () => {
    const shop = await signIn("grant@shop.test", "Grant Shop")
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const organizationId = shop.actor.organizationId

    const granted = await post<SubscriptionView>(
      staff.token,
      `/customers/${organizationId}/subscriptions`,
      { application: "expenses", planTier: "growth", interval: "monthly", priceHalalas: 29900 }
    )
    expect(granted.status).toBe(201)
    expect(granted.body).toMatchObject({ status: "active", billingInterval: "monthly" })
    expect((await orgSettings(organizationId)).expensesEnabled).toBe(true)

    const customer = await get<CustomerRow>(staff.token, `/customers/${organizationId}`)
    expect(customer.body).toMatchObject({ status: "active", monthlyRevenueHalalas: 29900 })

    // Renewing early stacks a year on top of the running month -- no days lost.
    const firstEnd = new Date(granted.body.currentPeriodEnd!)
    const renewed = await post<SubscriptionView>(
      staff.token,
      `/subscriptions/${granted.body.id}/renew`,
      { interval: "yearly" }
    )
    expect(renewed.status).toBe(200)
    const expectedEnd = new Date(firstEnd)
    expectedEnd.setUTCFullYear(expectedEnd.getUTCFullYear() + 1)
    expect(renewed.body.currentPeriodEnd).toBe(expectedEnd.toISOString())

    const cancelled = await post<SubscriptionView>(
      staff.token,
      `/subscriptions/${granted.body.id}/cancel`
    )
    expect(cancelled.body.status).toBe("cancelled")
    expect((await orgSettings(organizationId)).expensesEnabled).toBe(false)
    expect((await post(staff.token, `/subscriptions/${granted.body.id}/cancel`)).status).toBe(409)

    const subscriptions = await get<{ items: Array<{ id: string; organizationName: string }> }>(
      staff.token,
      "/subscriptions?status=cancelled"
    )
    expect(subscriptions.body.items).toEqual([
      expect.objectContaining({ id: granted.body.id, organizationName: "Grant Shop" }),
    ])

    const audit = await database.query<{ action: string }>(
      "select action from audit_logs where organization_id = $1 and action like 'platform_admin.%' order by created_at",
      [organizationId]
    )
    expect(audit.rows.map((row) => row.action)).toEqual([
      "platform_admin.subscription_granted",
      "platform_admin.subscription_renewed",
      "platform_admin.subscription_cancelled",
    ])
  })

  it("returns 404 for an unknown customer or subscription", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const missing = "00000000-0000-0000-0000-000000000000"
    expect((await get(staff.token, `/customers/${missing}`)).status).toBe(404)
    expect((await post(staff.token, `/subscriptions/${missing}/cancel`)).status).toBe(404)
  })

  it("rejects malformed filters and bodies with a 400", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    expect((await get(staff.token, "/customers?status=bogus")).status).toBe(400)
    expect(
      (
        await post(staff.token, `/customers/${staff.actor.organizationId}/subscriptions`, {
          application: "pos",
          interval: "weekly",
        })
      ).status
    ).toBe(400)
  })
})

describe("platform admin: overview", () => {
  it("summarizes customers, subscriptions, and revenue, and records today's snapshot", async () => {
    const shop = await signIn("overview@shop.test", "Overview Shop")
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    await post(staff.token, `/customers/${shop.actor.organizationId}/subscriptions`, {
      application: "pos",
      interval: "monthly",
      priceHalalas: 29900,
    })

    const overview = await get<{
      kpis: Record<string, { value: number; deltaPct: number | null }>
      trend: unknown[]
      subscriptionsByApplication: Array<{ application: string; count: number }>
      recentCustomers: Array<{ name: string }>
    }>(staff.token, "/overview")
    expect(overview.status).toBe(200)
    expect(overview.body.kpis.customers).toEqual({ value: 2, deltaPct: null })
    expect(overview.body.kpis.activeSubscriptions.value).toBe(1)
    expect(overview.body.kpis.mrrHalalas.value).toBe(29900)
    expect(overview.body.trend).toHaveLength(8)
    expect(overview.body.subscriptionsByApplication).toEqual([{ application: "pos", count: 1 }])

    const snapshots = await database.query("select * from platform_daily_metrics")
    expect(snapshots.rows).toHaveLength(1)
  })
})

interface UtilizationRow {
  id: string
  name: string
  usage: string
  members: number
  branches: number
  activityInRange: number
  totals: Record<string, number>
  inRange: Record<string, number>
  lastUsedAt: string | null
}
interface UtilizationBody {
  from: string
  to: string
  summary: {
    customers: number
    active: number
    idle: number
    never: number
    totals: Record<string, number>
    inRange: Record<string, number>
  }
  daily: Array<{ date: string; activeCustomers: number; products: number; customers: number }>
  page: { items: UtilizationRow[]; total: number }
}

describe("platform admin: utilization", () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

  async function addProducts(organizationId: string, count: number, createdAt: Date) {
    for (let index = 0; index < count; index += 1) {
      await database.query(
        `insert into products (id, organization_id, product_type, name, created_at)
         values ($1, $2, 'simple', 'Product', $3)`,
        [randomUUID(), organizationId, createdAt]
      )
    }
  }

  async function addShopCustomer(organizationId: string, createdAt: Date, deleted = false) {
    await database.query(
      `insert into customers (id, organization_id, name, created_at, deleted_at)
       values ($1, $2, 'Buyer', $3, $4)`,
      [randomUUID(), organizationId, createdAt, deleted ? new Date() : null]
    )
  }

  it("counts what each customer created, in total and inside the range, day by day", async () => {
    const busy = await signIn("busy@shop.test", "Busy Shop", {
      posEnabled: true,
      posTrialEndsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    })
    const quiet = await signIn("quiet@shop.test", "Quiet Shop")
    await signIn("empty@shop.test", "Empty Shop")
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const busyId = busy.actor.organizationId
    const quietId = quiet.actor.organizationId

    await addProducts(busyId, 3, daysAgo(2))
    await addProducts(busyId, 2, daysAgo(60))
    await addShopCustomer(busyId, daysAgo(2))
    await addShopCustomer(busyId, daysAgo(1), true)
    await addProducts(quietId, 4, daysAgo(90))
    await database.query(
      "insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')",
      [randomUUID(), busyId]
    )

    const all = await get<UtilizationBody>(staff.token, "/utilization")
    expect(all.status).toBe(200)
    const byName = Object.fromEntries(all.body.page.items.map((row) => [row.name, row]))
    // Deleted records don't count; older ones count in the total but not inside the range.
    expect(byName["Busy Shop"]).toMatchObject({ usage: "active", activityInRange: 4, branches: 1 })
    expect(byName["Busy Shop"].totals).toMatchObject({ products: 5, customers: 1 })
    expect(byName["Busy Shop"].inRange).toMatchObject({ products: 3, customers: 1 })
    expect(byName["Busy Shop"].lastUsedAt).not.toBeNull()
    expect(byName["Quiet Shop"]).toMatchObject({ usage: "idle", activityInRange: 0 })
    expect(byName["Quiet Shop"].totals.products).toBe(4)
    expect(byName["Empty Shop"]).toMatchObject({ usage: "never", lastUsedAt: null })
    // Most active first by default.
    expect(all.body.page.items[0].name).toBe("Busy Shop")

    expect(all.body.summary).toMatchObject({ customers: 4, active: 1, idle: 1, never: 2 })
    expect(all.body.summary.totals.products).toBe(9)
    expect(all.body.summary.inRange.products).toBe(3)

    // 30 days by default, one point per day, and the points add up to the range's numbers.
    expect(all.body.daily).toHaveLength(30)
    expect(all.body.daily.at(-1)?.date).toBe(all.body.to)
    expect(all.body.daily.reduce((sum, point) => sum + point.products, 0)).toBe(3)
    expect(all.body.daily.reduce((sum, point) => sum + point.activeCustomers, 0)).toBe(1)

    const trials = await get<UtilizationBody>(staff.token, "/utilization?status=trial")
    expect(trials.body.page.items.map((row) => row.id)).toEqual([busyId])
    expect(trials.body.summary.totals.products).toBe(5)

    const idle = await get<UtilizationBody>(staff.token, "/utilization?usage=idle")
    expect(idle.body.page.items.map((row) => row.id)).toEqual([quietId])

    const sorted = await get<UtilizationBody>(
      staff.token,
      "/utilization?sort=products&direction=asc&usage=idle&search=quiet"
    )
    expect(sorted.body.page.total).toBe(1)

    // A wider range picks up the older records.
    const day = (date: Date) => date.toISOString().slice(0, 10)
    const wide = await get<UtilizationBody>(
      staff.token,
      `/utilization?from=${day(daysAgo(120))}&to=${day(new Date())}`
    )
    expect(wide.body.summary).toMatchObject({ active: 2, idle: 0 })
    expect(wide.body.summary.inRange.products).toBe(9)

    // Signed up today, so a sign-up window that ended yesterday leaves nobody.
    const signedUpEarlier = await get<UtilizationBody>(
      staff.token,
      `/utilization?createdTo=${day(daysAgo(2))}`
    )
    expect(signedUpEarlier.body.page.total).toBe(0)
  })

  it("shows one customer's usage over time", async () => {
    const shop = await signIn("timeline@shop.test", "Timeline Shop")
    const other = await signIn("other@shop.test", "Other Shop")
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    await addProducts(shop.actor.organizationId, 2, daysAgo(3))
    await addProducts(shop.actor.organizationId, 1, daysAgo(10))
    await addProducts(other.actor.organizationId, 7, daysAgo(3))

    const detail = await get<{
      customer: UtilizationRow
      daily: Array<{ date: string; products: number }>
    }>(staff.token, `/utilization/${shop.actor.organizationId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.customer).toMatchObject({ name: "Timeline Shop", usage: "active" })
    expect(detail.body.customer.totals.products).toBe(3)
    expect(detail.body.daily).toHaveLength(30)
    expect(detail.body.daily.filter((point) => point.products > 0).map((p) => p.products)).toEqual([
      1, 2,
    ])

    expect((await get(staff.token, `/utilization/${randomUUID()}`)).status).toBe(404)
    expect((await get(staff.token, "/utilization?from=2020-01-01&to=2026-01-01")).status).toBe(400)
    expect((await get(shop.token, "/utilization")).status).toBe(403)
  })
})
