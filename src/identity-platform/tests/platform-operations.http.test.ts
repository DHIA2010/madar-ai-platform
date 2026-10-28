// @vitest-environment node
//
// Madar Admin's read-only operations views: connected stores across customers, integration health
// per provider, platform-wide tracking volume, and system health.

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
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

async function call<T = Record<string, unknown>>(path: string, token: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  return { status: response.status, body: (await response.json()) as T }
}

async function signIn(email: string, orgName: string) {
  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((response) => response.json() as Promise<Record<string, unknown>>)
  const registration = await post("/v1/auth/register", {
    email,
    password: PASSWORD,
    fullName: `${orgName} Owner`,
    organizationName: orgName,
  })
  await post("/v1/auth/verify-email", { token: registration.verificationToken })
  const login = (await post("/v1/auth/login", { email, password: PASSWORD })) as {
    session: { accessToken: string }
  }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', $3, now()) on conflict (id) do nothing`,
    [actor.userId, email, `${orgName} Owner`]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, $2, $3, 'active')
     on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  return { token: login.session.accessToken, actor }
}

async function seedSallaStore(
  organizationId: string,
  userId: string,
  runStatus: "completed" | "failed"
) {
  const connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, project_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, $3, 'connected', $4, $4, now(), now())`,
    [connectionId, organizationId, randomUUID(), userId]
  )
  await database.query(
    `insert into salla_stores (id, connection_id, account_id, account_name, status, is_selected)
     values ($1, $2, '9001', 'Shop on Salla', 'active', true)`,
    [randomUUID(), connectionId]
  )
  await database.query(
    `insert into salla_sync_runs (
       id, connection_id, organization_id, project_id, customer_id, date_start, date_end,
       idempotency_key, status, error_message, completed_at, created_by_user_id, updated_by_user_id
     ) values ($1, $2, $3, $4, '9001', '2026-10-01', '2026-10-27', $5, $6, $7, now(), $8, $8)`,
    [
      randomUUID(),
      connectionId,
      organizationId,
      randomUUID(),
      randomUUID(),
      runStatus,
      runStatus === "failed" ? "Salla API returned 401" : null,
      userId,
    ]
  )
}

describe("platform operations", () => {
  it("lists every connected store with its last sync, and integration health per provider", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("owner@shop.test", "Shop")
    await seedSallaStore(shop.actor.organizationId, shop.actor.userId, "failed")

    const stores = await call<{ items: Array<Record<string, unknown>>; total: number }>(
      "/v1/platform-admin/stores",
      staff.token
    )
    expect(stores.body.total).toBe(1)
    expect(stores.body.items[0]).toMatchObject({
      platform: "salla",
      accountName: "Shop on Salla",
      organizationName: "Shop",
      lastSyncStatus: "failed",
      lastSyncError: "Salla API returned 401",
    })
    const summary = await call<{
      total: number
      syncErrors: number
      byPlatform: Record<string, number>
    }>("/v1/platform-admin/stores/summary", staff.token)
    expect(summary.body).toMatchObject({
      total: 1,
      syncErrors: 1,
      byPlatform: { salla: 1, zid: 0 },
    })

    const integrations = await call<{
      providers: Array<{ provider: string; connected: number; failedSyncsLast24h: number }>
      recentFailures: Array<{ provider: string; organizationName: string }>
    }>("/v1/platform-admin/integrations", staff.token)
    expect(integrations.body.providers.find((entry) => entry.provider === "salla")).toMatchObject({
      connected: 1,
      failedSyncsLast24h: 1,
    })
    expect(integrations.body.recentFailures).toEqual([
      expect.objectContaining({ provider: "salla", organizationName: "Shop" }),
    ])
  })

  it("counts today's tracking events, purchases, and live visitors across customers", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("owner@shop.test", "Shop")
    for (const eventType of ["PAGE_VIEW", "PAGE_VIEW", "PURCHASE"]) {
      await database.query(
        `insert into tracking_events (id, organization_id, event_type, visitor_id, session_id, occurred_at)
         values ($1, $2, $3, 'v1', 's1', now())`,
        [randomUUID(), shop.actor.organizationId, eventType]
      )
    }
    await database.query(
      `insert into tracking_live_visitors (id, organization_id, visitor_id, session_id, last_seen_at)
       values ($1, $2, 'v1', 's1', now())`,
      [randomUUID(), shop.actor.organizationId]
    )

    const tracking = await call<Record<string, unknown>>("/v1/platform-admin/tracking", staff.token)
    expect(tracking.body).toMatchObject({
      eventsToday: 3,
      purchasesToday: 1,
      liveVisitorsNow: 1,
      topCustomersToday: [{ organizationName: "Shop", events: 3 }],
    })
    expect((tracking.body.last7Days as unknown[]).length).toBe(7)
  })

  it("reports system health, staff-only", async () => {
    const staff = await signIn(STAFF_EMAIL, "Madar HQ")
    const shop = await signIn("owner@shop.test", "Shop")
    const health = await call<{ database: { ok: boolean }; syncsLast24h: unknown[] }>(
      "/v1/platform-admin/system-health",
      staff.token
    )
    expect(health.body.database.ok).toBe(true)
    expect(health.body.syncsLast24h).toHaveLength(8)
    expect((await call("/v1/platform-admin/system-health", shop.token)).status).toBe(403)
    expect((await call("/v1/platform-admin/stores", shop.token)).status).toBe(403)
  })
})
