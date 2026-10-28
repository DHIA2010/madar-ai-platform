// @vitest-environment node
//
// The Madar Admin console's backend (/v1/platform-admin/*): cross-tenant customers and
// subscriptions, and the grant/renew/cancel actions that keep organization_subscriptions and the
// organizations.settings access flags in step.

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
