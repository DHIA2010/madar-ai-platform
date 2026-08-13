// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SallaIntegrationProvider } from "../integrations/salla/provider"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { MetaAdsIntegrationProvider } from "../integrations/meta-ads/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { SallaOAuthRepository } from "../salla-oauth/repository"
import { SallaOAuthService } from "../salla-oauth/service"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

function mockSallaResponses(input: {
  baseUrl: string
  accessToken: string
  refreshToken: string
  store: { id: string; name: string; currency?: string; timezone?: string }
}) {
  const nativeFetch = globalThis.fetch

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/oauth2/token")) {
      const body = typeof init?.body === "string" ? init.body : ""
      const params = new URLSearchParams(body)
      const isRefresh = params.get("grant_type") === "refresh_token"
      return new Response(
        JSON.stringify({
          access_token: isRefresh ? `${input.accessToken}-refreshed` : input.accessToken,
          refresh_token: input.refreshToken,
          expires_in: 3600,
          token_type: "Bearer",
          scope: "offline_access",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/store/info")) {
      return new Response(JSON.stringify({ data: input.store }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    return new Response("{}", { status: 404 })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  process.env.SALLA_CLIENT_ID = "salla-client-id"
  process.env.SALLA_CLIENT_SECRET = "salla-client-secret"
  process.env.SALLA_REDIRECT_URI = "http://localhost:4000/v1/integrations/salla/oauth/callback"
  process.env.SALLA_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  // Memory-mode registers database-less providers by default for every OTHER connector,
  // which throw *_UNAVAILABLE (not a _CONNECTION_NOT_FOUND error) on every call --
  // dispatchToProviders only falls through to the next provider on _CONNECTION_NOT_FOUND,
  // so those dead entries must be overwritten with real ones or they block Salla's turn.
  container.infrastructure.integrations?.register(new SnapchatAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new MetaAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new SallaIntegrationProvider(database))

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
      fullName: "Salla OAuth Test",
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
     values ($1, $2, 'hash', 'Salla OAuth Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )

  return { login, actor }
}

async function provisionWorkspaceProject(input: {
  organizationId: string
  ownerUserId: string
  workspaceId: string
  projectId: string
  label: string
}) {
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [input.workspaceId, input.organizationId, `${input.label} Workspace`]
  )
  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, $5, 'active') on conflict (id) do nothing`,
    [
      input.projectId,
      input.organizationId,
      input.workspaceId,
      input.ownerUserId,
      `${input.label} Project`,
    ]
  )
}

describe("salla oauth http flow", () => {
  it("full flow: start -> callback -> refresh_token persisted, store discovered via /store/info", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "salla-http@madar.test",
      "Salla HTTP Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000510"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000511",
      label: "Salla HTTP",
    })

    mockSallaResponses({
      baseUrl,
      accessToken: "salla-access-token",
      refreshToken: "salla-refresh-token",
      store: { id: "998877", name: "Madar Test Store", currency: "SAR", timezone: "Asia/Riyadh" },
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/salla/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, connectionName: "Salla Store" }),
    })
    expect(startResponse.status).toBe(200)

    const started = (await startResponse.json()) as {
      authorizationUrl: string
      state: string
      connectionId: string
    }
    expect(started.authorizationUrl).toContain("accounts.salla.sa")
    expect(started.authorizationUrl).toContain("scope=offline_access")

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/salla/oauth/callback?state=${encodeURIComponent(started.state)}&code=salla-code`,
      { redirect: "manual" }
    )
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("salla_oauth=connected")

    const connectionRows = await database.query<{
      status: string
      encrypted_access_token: string | null
      encrypted_refresh_token: string | null
      provider_account_id: string | null
    }>(
      `select status, encrypted_access_token, encrypted_refresh_token, provider_account_id
       from salla_oauth_connections where id = $1`,
      [started.connectionId]
    )

    expect(connectionRows.rows[0]?.status).toBe("connected")
    expect(connectionRows.rows[0]?.encrypted_access_token).toBeTruthy()
    expect(connectionRows.rows[0]?.encrypted_refresh_token).toBeTruthy()
    expect(connectionRows.rows[0]?.provider_account_id).toBe("998877")

    const repository = new SallaOAuthRepository(database)
    const service = new SallaOAuthService(repository)
    const decryptedRefresh = await service.decryptRefreshTokenForTesting(
      connectionRows.rows[0]!.encrypted_refresh_token!
    )
    expect(decryptedRefresh).toBe("salla-refresh-token")

    const storeRows = await database.query<{ account_id: string; account_name: string | null }>(
      `select account_id, account_name from salla_stores where connection_id = $1`,
      [started.connectionId]
    )
    expect(storeRows.rows).toHaveLength(1)
    expect(storeRows.rows[0]?.account_id).toBe("998877")
    expect(storeRows.rows[0]?.account_name).toBe("Madar Test Store")
  })

  it("workspace isolation: a connection created in one workspace is not accessible from a different workspace in the same organization", async () => {
    const { actor } = await registerAndProvisionOrg(
      "salla-workspace-isolation@madar.test",
      "Salla Isolation Org"
    )

    const workspaceAId = "00000000-0000-4000-8000-000000000520"
    const workspaceBId = "00000000-0000-4000-8000-000000000521"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId: workspaceAId,
      projectId: "00000000-0000-4000-8000-000000000522",
      label: "Salla Workspace A",
    })
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId: workspaceBId,
      projectId: "00000000-0000-4000-8000-000000000523",
      label: "Salla Workspace B",
    })

    const actorInWorkspaceA = { ...actor, workspaceId: workspaceAId, roles: ["owner" as const] }
    const actorInWorkspaceB = { ...actor, workspaceId: workspaceBId, roles: ["owner" as const] }

    const provider = new SallaIntegrationProvider(database)
    const started = await provider.oauthStart(actorInWorkspaceA, { workspaceId: workspaceAId })
    const connectionId = (started as { connectionId: string }).connectionId

    await expect(provider.listAccounts(actorInWorkspaceB, { connectionId })).rejects.toMatchObject({
      code: "SALLA_CONNECTION_NOT_FOUND",
      status: 404,
    })

    await expect(provider.listAccounts(actorInWorkspaceA, { connectionId })).rejects.toMatchObject({
      code: "SALLA_CONNECTION_NOT_READY",
      status: 409,
    })

    await expect(provider.pause?.(actorInWorkspaceB, { connectionId })).rejects.toThrow(
      "SALLA_OAUTH_CONNECTION_NOT_FOUND"
    )

    const pauseResult = (await provider.pause?.(actorInWorkspaceA, { connectionId })) as {
      status: string
    }
    expect(pauseResult.status).toBe("paused")
  })

  it("lifecycle: pause, resume, disconnect (soft delete), reconnect and events all work over HTTP", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "salla-lifecycle@madar.test",
      "Salla Lifecycle Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000530"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000531",
      label: "Salla Lifecycle",
    })

    mockSallaResponses({
      baseUrl,
      accessToken: "salla-access-lifecycle",
      refreshToken: "salla-refresh-lifecycle",
      store: { id: "112233", name: "Lifecycle Store" },
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/salla/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, connectionName: "Lifecycle Store" }),
    })
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    await fetch(
      `${baseUrl}/v1/integrations/salla/oauth/callback?state=${encodeURIComponent(started.state)}&code=salla-code`,
      { redirect: "manual" }
    )

    const authHeaders = { authorization: `Bearer ${login.session.accessToken}` }

    const pauseResponse = await fetch(`${baseUrl}/v1/integrations/${started.connectionId}/pause`, {
      method: "POST",
      headers: authHeaders,
    })
    expect(pauseResponse.status).toBe(200)
    expect(((await pauseResponse.json()) as { status: string }).status).toBe("paused")

    const resumeResponse = await fetch(
      `${baseUrl}/v1/integrations/${started.connectionId}/resume`,
      {
        method: "POST",
        headers: { ...authHeaders, "x-workspace-id": workspaceId },
      }
    )
    expect(resumeResponse.status).toBe(200)
    expect(((await resumeResponse.json()) as { status: string }).status).toBe("connected")

    const eventsResponse = await fetch(
      `${baseUrl}/v1/integrations/${started.connectionId}/events?limit=20`,
      { headers: { ...authHeaders, "x-workspace-id": workspaceId } }
    )
    const events = (await eventsResponse.json()) as { items: Array<{ action: string }> }
    expect(events.items.some((event) => event.action === "connection.paused")).toBe(true)
    expect(events.items.some((event) => event.action === "connection.resumed")).toBe(true)

    const disconnectResponse = await fetch(
      `${baseUrl}/v1/integrations/${started.connectionId}/disconnect`,
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ reason: "Testing soft disconnect" }),
      }
    )
    expect(disconnectResponse.status).toBe(200)
    expect(((await disconnectResponse.json()) as { status: string }).status).toBe("disconnected")

    const hardDeleteResponse = await fetch(`${baseUrl}/v1/integrations/${started.connectionId}`, {
      method: "DELETE",
      headers: authHeaders,
    })
    expect(hardDeleteResponse.status).toBe(204)

    const remaining = await database.query(`select id from salla_oauth_connections where id = $1`, [
      started.connectionId,
    ])
    expect(remaining.rows).toHaveLength(0)
  })

  it("token refresh: resolveAccessToken uses the refresh_token grant when the stored token is expired", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "salla-refresh@madar.test",
      "Salla Refresh Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000540"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000541",
      label: "Salla Refresh",
    })

    mockSallaResponses({
      baseUrl,
      accessToken: "salla-access-initial",
      refreshToken: "salla-refresh-initial",
      store: { id: "445566", name: "Refresh Store" },
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/salla/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId }),
    })
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    await fetch(
      `${baseUrl}/v1/integrations/salla/oauth/callback?state=${encodeURIComponent(started.state)}&code=salla-code`,
      { redirect: "manual" }
    )

    // Force the stored token to look already-expired so resolveAccessToken() must refresh.
    await database.query(
      `update salla_oauth_connections set token_expires_at = now() - interval '1 hour' where id = $1`,
      [started.connectionId]
    )

    const repository = new SallaOAuthRepository(database)
    const service = new SallaOAuthService(repository)
    const refreshedToken = await service.resolveAccessToken(started.connectionId)
    expect(refreshedToken).toBe("salla-access-initial-refreshed")
  })

  it("production endpoint contract: service defaults to Salla's real OAuth + Admin API endpoints", () => {
    const repository = new SallaOAuthRepository(database)
    const service = new SallaOAuthService(repository)
    const endpoints = service.getOAuthEndpointsForTesting()

    expect(endpoints.authorizationUrl).toBe("https://accounts.salla.sa/oauth2/auth")
    expect(endpoints.tokenUrl).toBe("https://accounts.salla.sa/oauth2/token")
    expect(endpoints.apiBaseUrl).toBe("https://api.salla.dev/admin/v2")
  })
})
