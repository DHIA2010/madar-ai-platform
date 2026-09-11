// @vitest-environment node
//
// Regression coverage for createWorkspaceSchema: it used to omit `settings` entirely, so a
// POST /v1/workspaces body that included it (e.g. a branch's initial currency/timezone) had that
// field silently stripped by zod's parse() before the command ever saw it -- the workspace was
// always created with empty settings no matter what the caller sent, and nothing caught it because
// every existing workspace test calls container.commands.createWorkspace directly, bypassing the
// REST schema layer where the bug actually lived.

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

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())

  const container = createIdentityPlatform({ mode: "memory" })
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
      fullName: "Workspace Creation Test",
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as {
    verificationToken: string
    organizationId: string
  }

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
  const login = (await loginResponse.json()) as {
    session: { accessToken: string; organizationId: string }
  }

  return { token: login.session.accessToken, organizationId: login.session.organizationId }
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

describe("POST /v1/workspaces", () => {
  it("persists metadata and settings sent on create, rather than silently dropping settings", async () => {
    const { token, organizationId } = await signIn("branch-create@example.com", "Branch Org")

    const response = await fetch(`${baseUrl}/v1/workspaces`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        organizationId,
        name: "فرع جدة",
        metadata: { city: "جدة", code: "BR-001" },
        settings: { currency: "SAR", timezone: "Asia/Riyadh" },
      }),
    })

    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      metadata: Record<string, string>
      settings: Record<string, unknown>
    }
    expect(body.metadata).toMatchObject({ city: "جدة", code: "BR-001" })
    expect(body.settings).toMatchObject({ currency: "SAR", timezone: "Asia/Riyadh" })
  })
})
