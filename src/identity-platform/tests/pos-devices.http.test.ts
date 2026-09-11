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
      fullName: "Registry Test",
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
     values ($1, $2, 'hash', 'Registry Test', now()) on conflict (id) do nothing`,
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

async function listDevices(token: string) {
  const response = await fetch(`${baseUrl}/v1/pos/devices`, { headers: authHeaders(token) })
  return {
    status: response.status,
    body: (await response.json()) as { items: Array<Record<string, unknown>> },
  }
}

async function createDevice(token: string, device: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/pos/devices`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(device),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

const SCALE = {
  name: "ميزان القسم الرئيسي",
  deviceType: "scale",
  model: "CAS SW-1",
  connection: "serial",
  port: "COM3",
  enabled: true,
}

describe("point-of-sale device registry", () => {
  it("starts empty and records a device", async () => {
    const { token } = await signIn("registry-create@example.com", "Registry Create")

    expect((await listDevices(token)).body.items).toHaveLength(0)

    const created = await createDevice(token, SCALE)
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      name: "ميزان القسم الرئيسي",
      deviceType: "scale",
      model: "CAS SW-1",
      connection: "serial",
      port: "COM3",
      enabled: true,
    })

    const list = await listDevices(token)
    expect(list.body.items).toHaveLength(1)
  })

  it("reports a device as offline until something has reported it", async () => {
    const { token } = await signIn("registry-online@example.com", "Registry Online")
    const created = await createDevice(token, SCALE)

    // Nothing in the platform pings this hardware, so a brand new device has never been heard
    // from and must not claim to be connected.
    expect(created.body.lastSeenAt).toBeNull()
    expect(created.body.online).toBe(false)

    // A recent check-in flips it; an old one does not.
    await database.query(`update pos_devices set last_seen_at = now()`)
    expect((await listDevices(token)).body.items[0]).toMatchObject({ online: true })

    await database.query(`update pos_devices set last_seen_at = now() - interval '1 hour'`)
    expect((await listDevices(token)).body.items[0]).toMatchObject({ online: false })
  })

  it("updates a device in place", async () => {
    const { token } = await signIn("registry-update@example.com", "Registry Update")
    const created = await createDevice(token, SCALE)

    const response = await fetch(`${baseUrl}/v1/pos/devices/${String(created.body.id)}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ ...SCALE, port: "COM4", enabled: false }),
    })

    expect(response.status).toBe(200)
    expect((await response.json()) as Record<string, unknown>).toMatchObject({
      id: created.body.id,
      port: "COM4",
      enabled: false,
    })
  })

  it("removes a device from the list", async () => {
    const { token } = await signIn("registry-delete@example.com", "Registry Delete")
    const created = await createDevice(token, SCALE)

    const removed = await fetch(`${baseUrl}/v1/pos/devices/${String(created.body.id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    })
    expect(removed.status).toBe(204)
    expect((await listDevices(token)).body.items).toHaveLength(0)
  })

  it("counts devices per branch across the whole organization, not just the caller's workspace", async () => {
    const { token, actor } = await signIn("registry-counts@example.com", "Registry Counts")

    // Two devices in the caller's own (current session) workspace.
    await createDevice(token, SCALE)
    await createDevice(token, { ...SCALE, name: "ميزان ثانٍ" })

    // A second branch under the same organization, with one device -- created directly since
    // list()/create() can only ever act on the caller's *current* session workspace, which is
    // exactly the gap countByWorkspace exists to cover.
    const otherWorkspaceId = "22222222-2222-4222-8222-222222222222"
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Second Branch', 'active')`,
      [otherWorkspaceId, actor.organizationId]
    )
    await database.query(
      `insert into pos_devices
         (id, organization_id, workspace_id, name, device_type, model, connection, enabled)
       values ($1, $2, $3, 'ميزان الفرع الثاني', 'scale', 'CAS SW-1', 'serial', true)`,
      ["33333333-3333-4333-8333-333333333333", actor.organizationId, otherWorkspaceId]
    )

    const response = await fetch(`${baseUrl}/v1/pos/devices/counts-by-workspace`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { counts: Record<string, number> }
    expect(body.counts[String(actor.workspaceId)]).toBe(2)
    expect(body.counts[otherWorkspaceId]).toBe(1)
  })

  it("keeps one organization's hardware out of another's", async () => {
    const first = await signIn("registry-org-a@example.com", "Registry Org A")
    const second = await signIn("registry-org-b@example.com", "Registry Org B")

    const created = await createDevice(first.token, SCALE)
    expect((await listDevices(second.token)).body.items).toHaveLength(0)

    const cross = await fetch(`${baseUrl}/v1/pos/devices/${String(created.body.id)}`, {
      method: "DELETE",
      headers: authHeaders(second.token),
    })
    expect(cross.status).toBe(404)
  })

  it("rejects a device type or connection outside the allowed set", async () => {
    const { token } = await signIn("registry-invalid@example.com", "Registry Invalid")

    expect((await createDevice(token, { ...SCALE, deviceType: "teleporter" })).status).toBe(400)
    expect((await createDevice(token, { ...SCALE, connection: "telepathy" })).status).toBe(400)
  })

  it("refuses an unauthenticated read", async () => {
    expect((await fetch(`${baseUrl}/v1/pos/devices`)).status).toBe(401)
  })
})
