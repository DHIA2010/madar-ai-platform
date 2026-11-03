// @vitest-environment node
//
// "الفوترة": an organization's own subscriptions and payments, and only theirs.

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
      fullName: "Procurement Test",
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
     values ($1, $2, 'hash', 'Procurement Test', now()) on conflict (id) do nothing`,
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

  // This file's own purpose is testing procurement CRUD behavior, not the subscription gate
  // itself -- every signed-in org here is pre-subscribed to Supply & Purchase. The gate itself is
  // covered by its own dedicated test below (an org that deliberately skips/undoes this step).
  await mergeOrgSettings(actor.organizationId, { procurementEnabled: true })

  return { token: login.session.accessToken, actor }
}

// pg-mem's jsonb `||` concatenation operator doesn't handle a cast parameter correctly -- read,
// merge in JS, and overwrite instead (same pattern ai-chat.test.ts's own setOrgSettingValue uses).
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

interface OverviewBody {
  organization: { name: string }
  subscriptions: { application: string; status: string; price: number | null }[]
  payments: {
    application: string
    method: string
    status: string
    amount: number
    discount: number | null
    invoiceNumber: string | null
  }[]
}

async function overview(token: string) {
  const response = await fetch(`${baseUrl}/v1/billing/overview`, { headers: authHeaders(token) })
  return { status: response.status, body: (await response.json()) as OverviewBody }
}

describe("billing overview", () => {
  it("lists the organization's subscriptions, card payments and bank transfers", async () => {
    const own = await signIn("billing-own@example.com", "Billing Own")
    const other = await signIn("billing-other@example.com", "Billing Other")
    const { organizationId, userId } = own.actor

    await database.query(
      `insert into organization_subscriptions
         (id, organization_id, application, status, billing_interval, price_halalas, source,
          started_at, current_period_end)
       values ($1, $2, 'pos', 'active', 'monthly', 9900, 'payment', now(), now() + interval '20 days')`,
      [randomUUID(), organizationId]
    )
    await database.query(
      `insert into billing_moyasar_payments
         (id, organization_id, requested_by_user_id, application, plan_tier, amount,
          moyasar_payment_id, status, original_amount, discount_halalas, billing_interval,
          created_at, updated_at)
       values ($1, $2, $3, 'pos', 'starter', 7900, 'pay_123', 'paid', 9900, 2000, 'monthly', now(), now()),
              ($4, $2, $3, 'pos', 'starter', 9900, 'pay_124', 'failed', null, null, 'monthly',
               now() - interval '1 day', now() - interval '1 day'),
              ($5, $2, $3, 'pos', 'starter', 9900, null, 'initiated', null, null, 'monthly', now(), now())`,
      [randomUUID(), organizationId, userId, randomUUID(), randomUUID()]
    )
    await database.query(
      `insert into subscription_activation_requests
         (id, organization_id, organization_name, requested_by_user_id, application, plan_tier,
          attachment_url, attachment_content_type, status, price_halalas, created_at)
       values ($1, $2, 'Billing Own', $3, 'ecommerce', 'starter', 'subscription-receipts/a.pdf',
               'application/pdf', 'pending', 14900, now() + interval '1 minute')`,
      [randomUUID(), organizationId, userId]
    )

    const result = await overview(own.token)
    expect(result.status).toBe(200)
    expect(result.body.organization.name).toBe("Billing Own")
    expect(result.body.subscriptions).toMatchObject([
      { application: "pos", status: "active", price: 99 },
    ])
    // Abandoned checkouts ("initiated") aren't payments; the newest comes first.
    expect(result.body.payments.map((p) => [p.method, p.status])).toEqual([
      ["bank_transfer", "pending"],
      ["card", "paid"],
      ["card", "failed"],
    ])
    const paid = result.body.payments[1]
    expect(paid).toMatchObject({ amount: 79, discount: 20 })
    expect(paid.invoiceNumber).toMatch(/^MDR-\d{6}-[0-9A-F]{6}$/)
    expect(result.body.payments[0].invoiceNumber).toBeNull()

    // Another organization sees none of it.
    const elsewhere = await overview(other.token)
    expect(elsewhere.body.subscriptions).toEqual([])
    expect(elsewhere.body.payments).toEqual([])
  })
})

describe("public pricing", () => {
  it("shows madar.my the prices on sale without signing in, and nothing internal", async () => {
    const response = await fetch(`${baseUrl}/v1/public/pricing`)
    expect(response.status).toBe(200)
    const pricing = (await response.json()) as {
      application: string
      packages: Record<string, unknown>[]
    }[]
    expect(pricing.length).toBeGreaterThan(0)
    expect(pricing.map((entry) => entry.application)).toContain("pos")
    for (const entry of pricing) {
      for (const pkg of entry.packages) {
        expect(Object.keys(pkg).sort()).toEqual(
          [
            "description",
            "features",
            "isRecommended",
            "monthlyPriceHalalas",
            "name",
            "yearlyPriceHalalas",
          ].sort()
        )
      }
    }
  })
})
