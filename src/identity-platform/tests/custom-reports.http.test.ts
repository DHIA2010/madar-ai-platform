// @vitest-environment node
//
// Covers the real backend for Custom Reports' own subscription gate (reports/custom-reports-
// guard.ts): list/create/get/data/update/delete all require customReportsEnabled, independent of
// the "Ready reports" dashboards (which stay free/unpaywalled) and independent of reports:view/
// reports:manage, which every test here already grants (owner role).

import type { AddressInfo } from "node:net"

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
      fullName: "Custom Reports Test",
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
     values ($1, $2, 'hash', 'Custom Reports Test', now()) on conflict (id) do nothing`,
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

  // This file's own purpose is testing the Custom Reports subscription gate itself -- every
  // signed-in org here starts pre-subscribed so the non-gate tests exercise the real CRUD
  // behavior, and the gate tests below explicitly undo this.
  await mergeOrgSettings(actor.organizationId, { customReportsEnabled: true })

  return { token: login.session.accessToken, actor }
}

// pg-mem's jsonb `||` concatenation operator doesn't handle a cast parameter correctly -- read,
// merge in JS, and overwrite instead (same pattern expenses.http.test.ts's own mergeOrgSettings
// uses).
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

function reportPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Report",
    description: "",
    category: "custom",
    defaultFilters: {},
    displayOptions: {},
    sharing: "private",
    status: "draft",
    workspaceId: null,
    widgets: [],
    ...overrides,
  }
}

async function listReports(token: string) {
  const response = await fetch(`${baseUrl}/v1/reports/custom`, { headers: authHeaders(token) })
  const body = await response.json()
  return {
    status: response.status,
    body: (Array.isArray(body) ? { items: body } : body) as {
      items?: Array<Record<string, unknown>>
    },
  }
}

async function createReport(token: string, overrides: Record<string, unknown> = {}) {
  const response = await fetch(`${baseUrl}/v1/reports/custom`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(reportPayload(overrides)),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function getReport(token: string, id: string) {
  const response = await fetch(`${baseUrl}/v1/reports/custom/${id}`, {
    headers: authHeaders(token),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function getReportData(token: string, id: string) {
  const response = await fetch(`${baseUrl}/v1/reports/custom/${id}/data`, {
    headers: authHeaders(token),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function updateReport(token: string, id: string, overrides: Record<string, unknown> = {}) {
  const response = await fetch(`${baseUrl}/v1/reports/custom/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(reportPayload(overrides)),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function deleteReport(token: string, id: string) {
  const response = await fetch(`${baseUrl}/v1/reports/custom/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe("custom reports", () => {
  it("creates, lists, fetches, updates, and deletes a report", async () => {
    const { token } = await signIn("owner-crud@example.com", "CRUD Org")

    const created = await createReport(token)
    expect(created.status).toBe(201)
    const reportId = created.body.id as string

    const list = await listReports(token)
    expect(list.status).toBe(200)
    expect(list.body.items?.some((item) => item.id === reportId)).toBe(true)

    const fetched = await getReport(token, reportId)
    expect(fetched.status).toBe(200)
    expect(fetched.body.name).toBe("Test Report")

    const data = await getReportData(token, reportId)
    expect(data.status).toBe(200)

    const updated = await updateReport(token, reportId, { name: "Renamed Report" })
    expect(updated.status).toBe(200)
    expect(updated.body.name).toBe("Renamed Report")

    const deleted = await deleteReport(token, reportId)
    expect(deleted.status).toBe(200)
  })

  it("isolates reports across organizations", async () => {
    const orgA = await signIn("owner-a@example.com", "Org A")
    const orgB = await signIn("owner-b@example.com", "Org B")

    const created = await createReport(orgA.token)
    const reportId = created.body.id as string

    const listFromB = await listReports(orgB.token)
    expect(listFromB.body.items?.some((item) => item.id === reportId)).toBe(false)

    const fetchFromB = await getReport(orgB.token, reportId)
    expect(fetchFromB.status).toBe(404)
  })
})

describe("custom reports: application-activation gate", () => {
  it("returns 403 for every route when the organization has not subscribed to Custom Reports", async () => {
    const { token, actor } = await signIn("no-subscription@example.com", "No Subscription Org")
    // Undo the customReportsEnabled:true that signIn() sets by default for every other test in
    // this file -- this test specifically wants an org that role-permission-wise could use these
    // routes (owner, so reports:view/reports:manage are both granted) but hasn't subscribed.
    await mergeOrgSettings(actor.organizationId, { customReportsEnabled: false })

    expect((await listReports(token)).status).toBe(403)
    expect((await createReport(token)).status).toBe(403)
    // A made-up but well-formed id, so routing matches and the request reaches the subscription
    // gate before any not-found check would otherwise short-circuit it.
    const fakeId = "00000000-0000-0000-0000-000000000000"
    expect((await getReport(token, fakeId)).status).toBe(403)
    expect((await getReportData(token, fakeId)).status).toBe(403)
    expect((await updateReport(token, fakeId)).status).toBe(403)
    expect((await deleteReport(token, fakeId)).status).toBe(403)
  })

  it("returns 403 once an active trial lapses, even though customReportsEnabled is still true", async () => {
    const { token, actor } = await signIn("lapsed-trial@example.com", "Lapsed Trial Org")
    await mergeOrgSettings(actor.organizationId, {
      customReportsTrialEndsAt: new Date(Date.now() - 1000).toISOString(),
    })

    expect((await listReports(token)).status).toBe(403)
  })

  it("never blocks the free Ready Reports routes regardless of Custom Reports subscription", async () => {
    const { token, actor } = await signIn("ready-only@example.com", "Ready Only Org")
    await mergeOrgSettings(actor.organizationId, { customReportsEnabled: false })

    const today = new Date().toISOString().slice(0, 10)
    const response = await fetch(
      `${baseUrl}/v1/reports/ready/net-income?from=${today}&to=${today}`,
      { headers: authHeaders(token) }
    )
    expect(response.status).not.toBe(403)
  })
})
