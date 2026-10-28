// @vitest-environment node
//
// Madar Admin governance: staff with fixed roles (and what each role may reach), the cross-
// customer activity log, and feature flags with per-customer overrides.

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

const OWNER_EMAIL = "owner@madar.test"
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
    config: { platformAdminEmails: [OWNER_EMAIL] },
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

async function signIn(email: string, orgName: string) {
  const registration = await call<{ verificationToken: string }>(
    "POST",
    "/v1/auth/register",
    null,
    {
      email,
      password: PASSWORD,
      fullName: `${orgName} Person`,
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
    [actor.userId, email, `${orgName} Person`]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, $2, $3, 'active')
     on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  return { token, actor }
}

describe("staff and roles", () => {
  it("gives an added staff member exactly their role's access, and removes it when disabled", async () => {
    const owner = await signIn(OWNER_EMAIL, "Madar HQ")
    const finance = await signIn("finance@madar.test", "Finance Person Org")

    // Not staff yet.
    expect((await call("GET", "/v1/platform-admin/payments", finance.token)).status).toBe(403)

    expect(
      (
        await call("POST", "/v1/platform-admin/staff", owner.token, {
          email: "finance@madar.test",
          role: "finance",
        })
      ).status
    ).toBe(201)

    // Finance reaches billing and pricing, but not operations or staff management.
    expect((await call("GET", "/v1/platform-admin/payments", finance.token)).status).toBe(200)
    expect((await call("GET", "/v1/platform-admin/customers", finance.token)).status).toBe(200)
    expect((await call("GET", "/v1/platform-admin/stores", finance.token)).status).toBe(403)
    expect((await call("GET", "/v1/platform-admin/staff", finance.token)).status).toBe(403)
    // Trial settings are pricing; platform-wide switches are not.
    expect(
      (await call("PATCH", "/v1/platform-admin/settings", finance.token, { trialDays: 10 })).status
    ).toBe(200)
    expect(
      (await call("PATCH", "/v1/platform-admin/settings", finance.token, { maintenanceMode: true }))
        .status
    ).toBe(403)

    const profile = await call<{ isPlatformAdmin: boolean; platformRole: string }>(
      "GET",
      "/v1/identity/profile",
      finance.token
    )
    expect(profile.body).toMatchObject({ isPlatformAdmin: true, platformRole: "finance" })

    const staff = await call<Array<{ email: string; role: string; isOwner: boolean }>>(
      "GET",
      "/v1/platform-admin/staff",
      owner.token
    )
    expect(staff.body.map((member) => [member.email, member.role, member.isOwner])).toEqual([
      [OWNER_EMAIL, "super_admin", true],
      ["finance@madar.test", "finance", false],
    ])

    await call("PATCH", `/v1/platform-admin/staff/${finance.actor.userId}`, owner.token, {
      status: "disabled",
    })
    expect((await call("GET", "/v1/platform-admin/payments", finance.token)).status).toBe(403)
  })

  it("refuses adding someone without a Madar account, or a permanent owner", async () => {
    const owner = await signIn(OWNER_EMAIL, "Madar HQ")
    const missing = await call<{ code: string }>("POST", "/v1/platform-admin/staff", owner.token, {
      email: "nobody@madar.test",
      role: "support",
    })
    expect(missing).toMatchObject({ status: 404, body: { code: "STAFF_USER_NOT_FOUND" } })
    expect(
      (
        await call("POST", "/v1/platform-admin/staff", owner.token, {
          email: OWNER_EMAIL,
          role: "support",
        })
      ).status
    ).toBe(409)
  })
})

describe("feature flags", () => {
  it("evaluates the global switch, rollout, and per-customer overrides for each customer", async () => {
    const owner = await signIn(OWNER_EMAIL, "Madar HQ")
    const shop = await signIn("shop@shop.test", "Shop")
    await call("POST", "/v1/platform-admin/feature-flags", owner.token, {
      key: "ai-insights",
      description: "AI insights panel",
      enabled: false,
    })
    expect((await call("GET", "/v1/feature-flags", shop.token)).body).toEqual({
      "ai-insights": false,
    })

    await call("PUT", "/v1/platform-admin/feature-flags/ai-insights/overrides", owner.token, {
      organizationId: shop.actor.organizationId,
      enabled: true,
    })
    expect((await call("GET", "/v1/feature-flags", shop.token)).body).toEqual({
      "ai-insights": true,
    })

    // Removing the override falls back to the global switch, now on for everyone.
    await call("PUT", "/v1/platform-admin/feature-flags/ai-insights/overrides", owner.token, {
      organizationId: shop.actor.organizationId,
      enabled: null,
    })
    await call("PATCH", "/v1/platform-admin/feature-flags/ai-insights", owner.token, {
      description: "AI insights panel",
      enabled: true,
      rolloutPercentage: null,
    })
    expect((await call("GET", "/v1/feature-flags", shop.token)).body).toEqual({
      "ai-insights": true,
    })

    const flags = await call<Array<{ key: string; overrides: unknown[] }>>(
      "GET",
      "/v1/platform-admin/feature-flags",
      owner.token
    )
    expect(flags.body).toEqual([expect.objectContaining({ key: "ai-insights", overrides: [] })])
    expect(
      (
        await call("POST", "/v1/platform-admin/feature-flags", owner.token, {
          key: "ai-insights",
          enabled: true,
        })
      ).status
    ).toBe(409)
  })
})
