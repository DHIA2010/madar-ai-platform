// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ZidIntegrationProvider } from "../integrations/zid/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

// Mirrors zid-sync.http.test.ts's mockZidResponses -- only the token exchange and store-profile
// endpoints matter here, no product/order/customer sync involved.
function mockZidTokenAndProfile(input: {
  accessToken: string
  refreshToken: string
  store: { id: string; title: string; currencyCode?: string; timezone?: string }
}) {
  const nativeFetch = globalThis.fetch

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    // Pass through calls to the test server itself (register/login/the install routes) --
    // only external Zid endpoints are intercepted below.
    if (url.startsWith(baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/oauth/token")) {
      return new Response(
        JSON.stringify({
          access_token: input.accessToken,
          refresh_token: input.refreshToken,
          expires_in: 3600 * 24 * 365,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/managers/account/profile")) {
      return new Response(
        JSON.stringify({
          user: {
            store: {
              id: input.store.id,
              title: input.store.title,
              currency: { code: input.store.currencyCode ?? "SAR" },
              timezone: input.store.timezone ?? "Asia/Riyadh",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    return new Response("{}", { status: 404 })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  process.env.ZID_CLIENT_ID = "zid-client-id"
  process.env.ZID_CLIENT_SECRET = "zid-client-secret"
  process.env.ZID_REDIRECT_URI = "http://localhost:4000/v1/integrations/zid/oauth/callback"
  process.env.ZID_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  container.infrastructure.integrations?.register(new ZidIntegrationProvider(database))

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  vi.restoreAllMocks()

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  await database.end()
})

async function registerAndProvisionOrg(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Zid Marketplace Install Test",
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
     values ($1, $2, 'hash', 'Zid Marketplace Install Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  // Note: deliberately NOT inserting a `projects` row here -- this test exercises
  // resolveOrCreateDefaultProject's auto-create path, matching a brand-new merchant who has
  // never used MADAR before and has no project yet.
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Default Workspace', 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId]
    )
  }

  return { login, actor }
}

function authHeaders(accessToken: string) {
  return { "content-type": "application/json", authorization: `Bearer ${accessToken}` }
}

async function completeMarketplaceCallback(): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/integrations/zid/oauth/callback?code=zid-mkt-code`, {
    redirect: "manual",
  })
  expect(response.status).toBe(302)
  const location = response.headers.get("location") ?? ""
  const match = location.match(/\/integrations\/zid\/claim\/([^/?]+)/)
  expect(match).not.toBeNull()
  return decodeURIComponent(match![1])
}

describe("Zid marketplace-initiated install (Activate from Zid's App Market)", () => {
  it("exchanges the code with no state, lands on an unclaimed install, and claims it into the actor's org", async () => {
    mockZidTokenAndProfile({
      accessToken: "mkt-access-token",
      refreshToken: "mkt-refresh-token",
      store: { id: "778899", title: "Marketplace Test Store" },
    })

    const claimToken = await completeMarketplaceCallback()

    // Public summary lookup -- no auth needed, no secrets returned.
    const summaryResponse = await fetch(`${baseUrl}/v1/integrations/zid/install/${claimToken}`)
    expect(summaryResponse.status).toBe(200)
    const summary = (await summaryResponse.json()) as {
      storeName: string
      currency: string | null
      status: string
    }
    expect(summary).toEqual({
      storeName: "Marketplace Test Store",
      currency: "SAR",
      status: "unclaimed",
    })

    const { login, actor } = await registerAndProvisionOrg(
      "zid-marketplace-owner@madar.test",
      "Zid Marketplace Org"
    )

    const claimResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/install/${claimToken}/claim`,
      { method: "POST", headers: authHeaders(login.session.accessToken) }
    )
    expect(claimResponse.status).toBe(200)
    const claimed = (await claimResponse.json()) as {
      connectionId: string
      organizationId: string
      projectId: string
      status: string
      accountName: string
    }
    expect(claimed.organizationId).toBe(actor.organizationId)
    expect(claimed.status).toBe("connected")
    expect(claimed.accountName).toBe("Marketplace Test Store")

    const connectionRows = await database.query(
      `SELECT status, provider_account_id, project_id FROM zid_oauth_connections WHERE id = $1`,
      [claimed.connectionId]
    )
    expect(connectionRows.rows[0]).toMatchObject({
      status: "connected",
      provider_account_id: "778899",
    })

    // resolveOrCreateDefaultProject's auto-create path -- no project existed before the claim.
    const projectRows = await database.query(`SELECT name FROM projects WHERE id = $1`, [
      claimed.projectId,
    ])
    expect(projectRows.rows[0]).toMatchObject({ name: "Zid Store" })

    const installRows = await database.query(
      `SELECT status, claimed_organization_id, claimed_connection_id FROM zid_marketplace_installs`
    )
    expect(installRows.rows[0]).toMatchObject({
      status: "claimed",
      claimed_organization_id: actor.organizationId,
      claimed_connection_id: claimed.connectionId,
    })

    // Single-use: a replayed claim of the same token must fail, not silently re-process.
    const replayResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/install/${claimToken}/claim`,
      { method: "POST", headers: authHeaders(login.session.accessToken) }
    )
    expect(replayResponse.status).not.toBe(200)
  })

  it("returns 404 for an unknown or garbage claim token", async () => {
    const response = await fetch(`${baseUrl}/v1/integrations/zid/install/not-a-real-token`)
    expect(response.status).toBe(404)
  })

  it("still completes the admin-initiated flow unchanged when state IS present", async () => {
    mockZidTokenAndProfile({
      accessToken: "admin-access-token",
      refreshToken: "admin-refresh-token",
      store: { id: "112233", title: "Admin Flow Store" },
    })

    const { login, actor } = await registerAndProvisionOrg(
      "zid-admin-owner@madar.test",
      "Zid Admin Org"
    )
    const workspaceId = actor.workspaceId as string
    const projectId = "00000000-0000-4000-8000-00000000ad01"
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ($1, $2, $3, $4, 'Admin Project', 'active')`,
      [projectId, actor.organizationId, workspaceId, actor.userId]
    )

    const startResponse = await fetch(`${baseUrl}/v1/integrations/zid/oauth/start`, {
      method: "POST",
      headers: {
        ...authHeaders(login.session.accessToken),
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, projectId }),
    })
    const started = (await startResponse.json()) as { state: string }

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/oauth/callback?state=${encodeURIComponent(started.state)}&code=admin-code`,
      { redirect: "manual" }
    )
    expect(callbackResponse.status).toBe(302)
    const location = callbackResponse.headers.get("location") ?? ""
    expect(location).toContain("zid_oauth=connected")
    // Not the marketplace claim page -- the admin flow's own success redirect.
    expect(location).not.toContain("/integrations/zid/claim/")

    // No unclaimed install row should exist for the admin-initiated path.
    const installRows = await database.query(
      `SELECT count(*)::int AS count FROM zid_marketplace_installs`
    )
    expect(installRows.rows[0].count).toBe(0)
  })
})
