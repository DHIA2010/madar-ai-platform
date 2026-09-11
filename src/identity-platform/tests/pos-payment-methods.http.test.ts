// @vitest-environment node
//
// Covers point-of-sale hardware settings (migration 048): GET and PUT /v1/pos/device-settings.

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
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
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

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
      fullName: "Payments Test",
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
     values ($1, $2, 'hash', 'Payments Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )

  // Registration creates the workspace inside the in-memory container rather than in this
  // pg-mem instance, so products.workspace_id would have nothing to reference.
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

async function listMethods(token: string) {
  const response = await fetch(`${baseUrl}/v1/pos/payment-methods`, { headers: authHeaders(token) })
  return {
    status: response.status,
    body: (await response.json()) as { items: Array<Record<string, unknown>> },
  }
}

async function patchMethod(token: string, code: string, update: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/payment-methods/${code}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(update),
  })
  return {
    status: response.status,
    body: (await response.json()) as { items?: Array<Record<string, unknown>> },
  }
}

describe("point-of-sale payment methods", () => {
  it("returns the built-in catalogue before anything is configured", async () => {
    const { token } = await signIn("pay-default@example.com", "Pay Default")

    const response = await listMethods(token)
    expect(response.status).toBe(200)
    expect(response.body.items.map((item) => item.code)).toEqual([
      "cash",
      "mada",
      "visa_mastercard",
      "apple_pay",
      "stc_pay",
      "bank_transfer",
      "tamara",
      "tabby",
    ])

    // Nothing stored yet, so every row is still on the catalogue default.
    expect(response.body.items.every((item) => item.configured === false)).toBe(true)
    expect(response.body.items[0]).toMatchObject({ code: "cash", enabled: true, feePercent: 0 })
    expect(response.body.items[6]).toMatchObject({ code: "tamara", enabled: false })
  })

  it("stores an override without touching the rest", async () => {
    const { token } = await signIn("pay-override@example.com", "Pay Override")

    const saved = await patchMethod(token, "mada", { enabled: true, feePercent: 0.75 })
    expect(saved.status).toBe(200)

    const mada = saved.body.items?.find((item) => item.code === "mada")
    expect(mada).toMatchObject({ enabled: true, feePercent: 0.75, configured: true })

    // Everything else is still reading the catalogue.
    const cash = saved.body.items?.find((item) => item.code === "cash")
    expect(cash).toMatchObject({ configured: false })

    const rows = await database.query("select count(*)::int as n from pos_payment_methods")
    expect(rows.rows[0].n).toBe(1)
  })

  it("updates an existing override in place", async () => {
    const { token } = await signIn("pay-update@example.com", "Pay Update")

    await patchMethod(token, "tabby", { enabled: true, feePercent: 2.5 })
    const second = await patchMethod(token, "tabby", { enabled: false, feePercent: 3 })

    expect(second.body.items?.find((item) => item.code === "tabby")).toMatchObject({
      enabled: false,
      feePercent: 3,
    })

    const rows = await database.query("select count(*)::int as n from pos_payment_methods")
    expect(rows.rows[0].n).toBe(1)
  })

  it("adds and removes a branch's own method", async () => {
    const { token } = await signIn("pay-custom@example.com", "Pay Custom")

    const created = await fetch(`${baseUrl}/v1/pos/payment-methods`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        code: "store_credit",
        name: "رصيد المتجر",
        subtitle: "الدفع من رصيد العميل",
        kind: "cash",
        enabled: true,
        feePercent: 0,
      }),
    })
    expect(created.status).toBe(201)

    const list = await listMethods(token)
    const custom = list.body.items.find((item) => item.code === "store_credit")
    expect(custom).toMatchObject({ name: "رصيد المتجر", isCustom: true })

    const removed = await fetch(`${baseUrl}/v1/pos/payment-methods/${String(custom?.id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    })
    expect(removed.status).toBe(204)
    expect((await listMethods(token)).body.items.some((item) => item.code === "store_credit")).toBe(
      false
    )
  })

  // A custom method's kind has no dedicated column -- it lives in the same settings jsonb as
  // merchantId/apiKey, and list() used to hardcode "cash" for every custom row regardless of what
  // was actually chosen at creation.
  it("keeps a custom method's real kind and provider fields, not a hardcoded default", async () => {
    const { token } = await signIn("pay-custom-kind@example.com", "Pay Custom Kind")

    const created = await fetch(`${baseUrl}/v1/pos/payment-methods`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        code: "custom_card",
        name: "بطاقة الفرع",
        subtitle: null,
        kind: "card",
        enabled: true,
        feePercent: 1.5,
        merchantId: "MC-1001",
        apiKey: "sk_test_abc123",
      }),
    })
    expect(created.status).toBe(201)

    const list = await listMethods(token)
    const custom = list.body.items.find((item) => item.code === "custom_card")
    expect(custom).toMatchObject({
      kind: "card",
      merchantId: "MC-1001",
      apiKey: "sk_test_abc123",
    })

    // Updating fee/enabled through the generic PATCH must not wipe the kind or provider fields
    // that were never re-sent... except merchantId/apiKey ARE re-sent (the form always sends the
    // full configuration), only kind survives implicitly via the merge in save().
    const patched = await patchMethod(token, "custom_card", {
      enabled: false,
      feePercent: 2,
      merchantId: "MC-1002",
      apiKey: "sk_test_xyz789",
    })
    expect(patched.status).toBe(200)
    const patchedCustom = patched.body.items?.find((item) => item.code === "custom_card")
    expect(patchedCustom).toMatchObject({
      kind: "card",
      enabled: false,
      feePercent: 2,
      merchantId: "MC-1002",
      apiKey: "sk_test_xyz789",
    })
  })

  it("lets a custom method's own name/subtitle be edited, but never a catalogue entry's", async () => {
    const { token } = await signIn("pay-custom-rename@example.com", "Pay Custom Rename")

    await fetch(`${baseUrl}/v1/pos/payment-methods`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        code: "custom_wallet",
        name: "محفظة الفرع",
        subtitle: "الدفع من رصيد العميل",
        kind: "wallet",
        enabled: true,
        feePercent: 0,
      }),
    })

    const renamed = await patchMethod(token, "custom_wallet", {
      enabled: true,
      feePercent: 0,
      merchantId: null,
      apiKey: null,
      name: "محفظة الفرع المعاد تسميتها",
      subtitle: "وصف جديد",
    })
    expect(renamed.status).toBe(200)
    expect(renamed.body.items?.find((item) => item.code === "custom_wallet")).toMatchObject({
      name: "محفظة الفرع المعاد تسميتها",
      subtitle: "وصف جديد",
    })

    // A catalogue entry's wording always comes from PAYMENT_METHOD_CATALOG (see list()), so a
    // name/subtitle sent for one is silently ignored rather than corrupting the built-in row.
    const catalogueRename = await patchMethod(token, "mada", {
      enabled: true,
      feePercent: 0.5,
      merchantId: null,
      apiKey: null,
      name: "اسم مزيف",
      subtitle: "وصف مزيف",
    })
    expect(catalogueRename.status).toBe(200)
    expect(catalogueRename.body.items?.find((item) => item.code === "mada")).toMatchObject({
      name: "مدى",
      feePercent: 0.5,
    })
  })

  it("refuses a custom method that collides with the catalogue", async () => {
    const { token } = await signIn("pay-collide@example.com", "Pay Collide")

    const response = await fetch(`${baseUrl}/v1/pos/payment-methods`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        code: "mada",
        name: "مدى الخاص",
        subtitle: null,
        kind: "card",
        enabled: true,
        feePercent: 1,
      }),
    })
    expect(response.status).toBe(409)
  })

  it("will not delete a catalogue method", async () => {
    const { token } = await signIn("pay-nodelete@example.com", "Pay NoDelete")
    await patchMethod(token, "cash", { enabled: false, feePercent: 0 })

    const stored = (await listMethods(token)).body.items.find((item) => item.code === "cash")
    // Disabling a built-in method stores a row, but that row is not the branch's to remove --
    // cash still exists as a way to pay, this branch just does not take it.
    const response = await fetch(`${baseUrl}/v1/pos/payment-methods/${String(stored?.id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    })
    expect(response.status).toBe(404)
  })

  it("rejects an unknown code and an out-of-range fee", async () => {
    const { token } = await signIn("pay-invalid@example.com", "Pay Invalid")

    expect((await patchMethod(token, "bitcoin", { enabled: true, feePercent: 1 })).status).toBe(404)
    expect((await patchMethod(token, "cash", { enabled: true, feePercent: 250 })).status).toBe(400)
  })

  it("keeps one organization's fees out of another's", async () => {
    const first = await signIn("pay-org-a@example.com", "Pay Org A")
    const second = await signIn("pay-org-b@example.com", "Pay Org B")

    await patchMethod(first.token, "mada", { enabled: true, feePercent: 0.75 })

    const other = await listMethods(second.token)
    expect(other.body.items.find((item) => item.code === "mada")).toMatchObject({
      configured: false,
      feePercent: 0,
    })
  })

  it("refuses an unauthenticated read", async () => {
    expect((await fetch(`${baseUrl}/v1/pos/payment-methods`)).status).toBe(401)
  })
})
