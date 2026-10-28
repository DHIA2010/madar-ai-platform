// @vitest-environment node
//
// Madar Admin billing, phase 3: the payments ledger (card + approved bank transfers), numbered
// receipts issued for every successful payment, and billing maintenance (renewal reminders once
// per period; lapsing a paid subscription after its grace period).

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import type { InMemoryEmailGateway } from "../infrastructure/email/in-memory-email-gateway"
import { createIdentityApiServer } from "../interfaces/rest/server"

const STAFF_EMAIL = "staff@madar.test"
const PASSWORD = "VeryStrongPassword123!"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
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

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as T }
}

async function signIn(email: string, orgName: string, settings: Record<string, unknown> = {}) {
  const registration = await call<{ verificationToken: string }>(
    "POST",
    "/v1/auth/register",
    null,
    {
      email,
      password: PASSWORD,
      fullName: `${orgName} Owner`,
      organizationName: orgName,
    }
  )
  await call("POST", "/v1/auth/verify-email", null, { token: registration.body.verificationToken })
  const login = await call<{ session: { accessToken: string } }>("POST", "/v1/auth/login", null, {
    email,
    password: PASSWORD,
  })
  const token = login.body.session.accessToken
  const actor = await container.commands.resolveActorFromAccessToken(token)
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
  return { token, actor }
}

async function insertPaidCardPayment(
  organizationId: string,
  userId: string,
  amount: number,
  at: string
) {
  const id = randomUUID()
  await database.query(
    `insert into billing_moyasar_payments (
       id, organization_id, requested_by_user_id, application, plan_tier, amount, currency,
       moyasar_payment_id, status, raw_payload, billing_interval, created_at, updated_at
     ) values ($1, $2, $3, 'pos', 'growth', $4, 'SAR', $5, 'paid', $6::jsonb, 'monthly', $7, $7)`,
    [
      id,
      organizationId,
      userId,
      amount,
      `pay_${id.slice(0, 6)}`,
      JSON.stringify({ source: { company: "mada" } }),
      at,
    ]
  )
  return id
}

async function insertApprovedTransfer(
  organizationId: string,
  userId: string,
  amount: number,
  at: string
) {
  const id = randomUUID()
  await database.query(
    `insert into subscription_activation_requests (
       id, organization_id, organization_name, requested_by_user_id, application, plan_tier,
       attachment_url, attachment_content_type, status, reviewed_at, created_at, updated_at,
       package_name, billing_interval, price_halalas
     ) values ($1, $2, 'Shop', $3, 'expenses', null, 'https://s3/receipt.png', 'image/png',
               'approved', $4, $4, $4, 'Expenses', 'yearly', $5)`,
    [id, organizationId, userId, at, amount]
  )
  return id
}

interface Payment {
  id: string
  method: string
  amountHalalas: number
  receiptId: string | null
}
interface Receipt {
  id: string
  number: string
  amountHalalas: number
  paymentMethod: string
  customer: { name: string; taxNumber: string | null }
}

describe("platform billing: payments and receipts", () => {
  it("lists card payments and approved transfers together, each with a numbered receipt", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("owner@shop.test", "Shop", { taxNumber: "300000000000003" })
    const { organizationId, userId } = shop.actor
    const card = await insertPaidCardPayment(organizationId, userId, 29900, "2026-10-01T10:00:00Z")
    const transfer = await insertApprovedTransfer(
      organizationId,
      userId,
      49000,
      "2026-10-02T10:00:00Z"
    )

    const payments = await call<{ items: Payment[]; total: number }>(
      "GET",
      "/v1/platform-admin/payments",
      staff.token
    )
    expect(payments.body.total).toBe(2)
    expect(payments.body.items.map((payment) => [payment.id, payment.method])).toEqual([
      [transfer, "bank_transfer"],
      [card, "card"],
    ])
    expect(payments.body.items.every((payment) => payment.receiptId)).toBe(true)

    const receipts = await call<{ items: Receipt[] }>(
      "GET",
      "/v1/platform-admin/receipts",
      staff.token
    )
    // Numbered in the order the payments happened, newest first in the list.
    expect(receipts.body.items.map((receipt) => [receipt.number, receipt.amountHalalas])).toEqual([
      ["MDR-000002", 49000],
      ["MDR-000001", 29900],
    ])
    const detail = await call<Receipt & { seller: { name: string } }>(
      "GET",
      `/v1/platform-admin/receipts/${receipts.body.items[1].id}`,
      staff.token
    )
    expect(detail.body).toMatchObject({
      paymentMethod: "mada",
      customer: { name: "Shop", taxNumber: "300000000000003" },
      seller: { name: "مدار" },
    })

    const summary = await call<{ collectedHalalas: number; paidCount: number }>(
      "GET",
      "/v1/platform-admin/payments/summary",
      staff.token
    )
    expect(summary.body).toMatchObject({ collectedHalalas: 78900, paidCount: 2 })

    // Reading again never issues a second receipt for the same payment.
    const again = await call<{ items: Receipt[] }>(
      "GET",
      "/v1/platform-admin/receipts",
      staff.token
    )
    expect(again.body.items).toHaveLength(2)
  })

  it("filters payments by method", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("owner@shop.test", "Shop")
    await insertPaidCardPayment(
      shop.actor.organizationId,
      shop.actor.userId,
      9900,
      "2026-10-01T10:00:00Z"
    )
    await insertApprovedTransfer(
      shop.actor.organizationId,
      shop.actor.userId,
      49000,
      "2026-10-02T10:00:00Z"
    )
    const transfers = await call<{ items: Payment[] }>(
      "GET",
      "/v1/platform-admin/payments?method=bank_transfer",
      staff.token
    )
    expect(transfers.body.items.map((payment) => payment.method)).toEqual(["bank_transfer"])
  })
})

describe("platform billing: maintenance", () => {
  async function grant(staffToken: string, organizationId: string, application: string) {
    return call<{ id: string }>(
      "POST",
      `/v1/platform-admin/customers/${organizationId}/subscriptions`,
      staffToken,
      { application, interval: "monthly", priceHalalas: 9900 }
    )
  }

  it("emails one reminder per period shortly before a paid period ends", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("owner@shop.test", "Shop")
    const granted = await grant(staff.token, shop.actor.organizationId, "pos")
    await database.query(
      "update organization_subscriptions set current_period_end = $2 where id = $1",
      [granted.body.id, new Date(Date.now() + 2 * 86_400_000).toISOString()]
    )

    const first = await call<{ remindersSent: number }>(
      "POST",
      "/v1/platform-admin/billing/maintenance",
      staff.token
    )
    const second = await call<{ remindersSent: number }>(
      "POST",
      "/v1/platform-admin/billing/maintenance",
      staff.token
    )
    expect(first.body.remindersSent).toBe(1)
    expect(second.body.remindersSent).toBe(0)
    const sent = (container.emailGateway as InMemoryEmailGateway).sent.filter(
      (email) => email.kind === "renewal_reminder"
    )
    expect(sent).toEqual([
      expect.objectContaining({ email: "owner@shop.test", applicationLabel: "نقطة البيع" }),
    ])
  })

  it("switches a paid app off once its period plus the grace period has passed", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("owner@shop.test", "Shop")
    const organizationId = shop.actor.organizationId
    const lapsed = await grant(staff.token, organizationId, "pos")
    const running = await grant(staff.token, organizationId, "ai")
    // Grace period is 7 days by default -- 8 days past the end has lapsed; the other is fine.
    await database.query(
      "update organization_subscriptions set current_period_end = $2 where id = $1",
      [lapsed.body.id, new Date(Date.now() - 8 * 86_400_000).toISOString()]
    )

    const result = await call<{ expired: number }>(
      "POST",
      "/v1/platform-admin/billing/maintenance",
      staff.token
    )
    expect(result.body.expired).toBe(1)

    const settings = (
      await database.query<{ settings: Record<string, unknown> }>(
        "select settings from organizations where id = $1",
        [organizationId]
      )
    ).rows[0].settings
    expect(settings).toMatchObject({ posEnabled: false, aiEnabled: true })
    const statuses = await database.query<{ id: string; status: string }>(
      "select id, status from organization_subscriptions where organization_id = $1",
      [organizationId]
    )
    expect(Object.fromEntries(statuses.rows.map((row) => [row.id, row.status]))).toEqual({
      [lapsed.body.id]: "expired",
      [running.body.id]: "active",
    })
  })

  it("is staff-only", async () => {
    const shop = await signIn("owner@shop.test", "Shop")
    expect((await call("POST", "/v1/platform-admin/billing/maintenance", shop.token)).status).toBe(
      403
    )
    expect((await call("GET", "/v1/platform-admin/payments", shop.token)).status).toBe(403)
  })
})
