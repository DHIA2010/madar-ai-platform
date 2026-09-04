// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { MetaAdsIntegrationProvider } from "../integrations/meta-ads/provider"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { MetaOAuthRepository } from "../meta-oauth/repository"
import { MetaOAuthService } from "../meta-oauth/service"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

function mockMetaGraphResponses(input: {
  baseUrl: string
  accessToken: string
  longLivedToken: string
  adAccounts: Array<{ id: string; name: string; account_status?: number; currency?: string }>
}) {
  const nativeFetch = globalThis.fetch

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/oauth/access_token")) {
      const parsed = new URL(url)
      if (parsed.searchParams.get("grant_type") === "fb_exchange_token") {
        return new Response(
          JSON.stringify({
            access_token: input.longLivedToken,
            token_type: "bearer",
            expires_in: 60 * 24 * 60 * 60,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }
      return new Response(
        JSON.stringify({ access_token: input.accessToken, token_type: "bearer", expires_in: 5400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/me/adaccounts")) {
      return new Response(JSON.stringify({ data: input.adAccounts }), {
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

  process.env.META_OAUTH_CLIENT_ID = "meta-app-id"
  process.env.META_OAUTH_CLIENT_SECRET = "meta-app-secret"
  process.env.META_OAUTH_REDIRECT_URI =
    "http://localhost:4000/v1/integrations/meta-ads/oauth/callback"
  process.env.META_OAUTH_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  // Memory-mode registers a database-less SnapchatAdsIntegrationProvider by default, which
  // throws SNAPCHAT_OAUTH_UNAVAILABLE (not a *_CONNECTION_NOT_FOUND error) on every call --
  // dispatchToProviders only falls through to the next provider on _CONNECTION_NOT_FOUND, so
  // that dead entry must be overwritten with a real one or it blocks Meta's turn entirely.
  container.infrastructure.integrations?.register(new SnapchatAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new MetaAdsIntegrationProvider(database))

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
      fullName: "Meta OAuth Test",
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
     values ($1, $2, 'hash', 'Meta OAuth Test', now()) on conflict (id) do nothing`,
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

describe("meta oauth http flow", () => {
  it("full flow: start -> callback -> long-lived token persisted, no refresh_token, account discovered via /me/adaccounts", async () => {
    const { login, actor } = await registerAndProvisionOrg("meta-http@madar.test", "Meta HTTP Org")
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000410"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000411",
      label: "Meta HTTP",
    })

    mockMetaGraphResponses({
      baseUrl,
      accessToken: "meta-short-lived-token",
      longLivedToken: "meta-long-lived-token",
      adAccounts: [
        { id: "act_1046499258099100", name: "Diaa Hagar", account_status: 1, currency: "SAR" },
      ],
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/meta-ads/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, connectionName: "Meta Ads Account" }),
    })
    expect(startResponse.status).toBe(200)

    const started = (await startResponse.json()) as {
      authorizationUrl: string
      state: string
      connectionId: string
    }
    expect(started.authorizationUrl).toContain("facebook.com")
    expect(started.authorizationUrl).toContain("scope=ads_read")

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/meta-ads/oauth/callback?state=${encodeURIComponent(started.state)}&code=meta-code`,
      { redirect: "manual" }
    )
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("meta_oauth=connected")

    const connectionRows = await database.query<{
      status: string
      encrypted_access_token: string | null
      encrypted_refresh_token: string | null
      provider_account_id: string | null
    }>(
      `select status, encrypted_access_token, encrypted_refresh_token, provider_account_id
       from meta_oauth_connections where id = $1`,
      [started.connectionId]
    )

    expect(connectionRows.rows[0]?.status).toBe("connected")
    expect(connectionRows.rows[0]?.encrypted_access_token).toBeTruthy()
    // The defining Meta difference: there is no refresh_token grant, so this must stay null,
    // unlike Snapchat/Google connections which require one.
    expect(connectionRows.rows[0]?.encrypted_refresh_token).toBeNull()
    expect(connectionRows.rows[0]?.provider_account_id).toBe("act_1046499258099100")

    const repository = new MetaOAuthRepository(database)
    const service = new MetaOAuthService(repository)
    const decrypted = await service.decryptAccessTokenForTesting(
      connectionRows.rows[0]!.encrypted_access_token!
    )
    // Confirms the stored token is the *long-lived* exchange result, not the short-lived one.
    expect(decrypted).toBe("meta-long-lived-token")

    const accountRows = await database.query<{
      account_id: string
      account_name: string | null
      currency_code: string | null
    }>(
      `select account_id, account_name, currency_code from meta_ads_accounts where connection_id = $1`,
      [started.connectionId]
    )
    expect(accountRows.rows).toHaveLength(1)
    expect(accountRows.rows[0]?.account_id).toBe("act_1046499258099100")
    expect(accountRows.rows[0]?.account_name).toBe("Diaa Hagar")
    // Real currency requested from the Graph API and persisted -- previously hardcoded to null
    // regardless of what Meta returned, which silently broke currency-aware spend conversion.
    expect(accountRows.rows[0]?.currency_code).toBe("SAR")
  })

  it("workspace isolation: a connection created in one workspace is not accessible from a different workspace in the same organization", async () => {
    const { actor } = await registerAndProvisionOrg(
      "meta-workspace-isolation@madar.test",
      "Meta Isolation Org"
    )

    const workspaceAId = "00000000-0000-4000-8000-000000000420"
    const workspaceBId = "00000000-0000-4000-8000-000000000421"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId: workspaceAId,
      projectId: "00000000-0000-4000-8000-000000000422",
      label: "Meta Workspace A",
    })
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId: workspaceBId,
      projectId: "00000000-0000-4000-8000-000000000423",
      label: "Meta Workspace B",
    })

    const actorInWorkspaceA = { ...actor, workspaceId: workspaceAId, roles: ["owner" as const] }
    const actorInWorkspaceB = { ...actor, workspaceId: workspaceBId, roles: ["owner" as const] }

    const provider = new MetaAdsIntegrationProvider(database)
    const started = await provider.oauthStart(actorInWorkspaceA, { workspaceId: workspaceAId })
    const connectionId = (started as { connectionId: string }).connectionId

    await expect(provider.listAccounts(actorInWorkspaceB, { connectionId })).rejects.toMatchObject({
      code: "META_ADS_CONNECTION_NOT_FOUND",
      status: 404,
    })

    await expect(provider.listAccounts(actorInWorkspaceA, { connectionId })).rejects.toMatchObject({
      code: "META_ADS_CONNECTION_NOT_READY",
      status: 409,
    })

    await expect(provider.pause?.(actorInWorkspaceB, { connectionId })).rejects.toThrow(
      "META_OAUTH_CONNECTION_NOT_FOUND"
    )

    const pauseResult = (await provider.pause?.(actorInWorkspaceA, { connectionId })) as {
      status: string
    }
    expect(pauseResult.status).toBe("paused")
  })

  it("lifecycle: pause, resume, disconnect (soft delete), reconnect and events all work over HTTP", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "meta-lifecycle@madar.test",
      "Meta Lifecycle Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000430"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000431",
      label: "Meta Lifecycle",
    })

    mockMetaGraphResponses({
      baseUrl,
      accessToken: "meta-short-lifecycle",
      longLivedToken: "meta-long-lifecycle",
      adAccounts: [{ id: "act_lifecycle", name: "Lifecycle Account", account_status: 1 }],
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/meta-ads/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, connectionName: "Lifecycle Account" }),
    })
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    await fetch(
      `${baseUrl}/v1/integrations/meta-ads/oauth/callback?state=${encodeURIComponent(started.state)}&code=meta-code`,
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

    const remaining = await database.query(`select id from meta_oauth_connections where id = $1`, [
      started.connectionId,
    ])
    expect(remaining.rows).toHaveLength(0)
  })

  it("token renewal: resolveAccessToken re-exchanges a token nearing its 60-day expiry instead of failing", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "meta-renewal@madar.test",
      "Meta Renewal Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000440"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000441",
      label: "Meta Renewal",
    })

    mockMetaGraphResponses({
      baseUrl,
      accessToken: "meta-short-renewal",
      longLivedToken: "meta-long-renewal-initial",
      adAccounts: [{ id: "act_renewal", name: "Renewal Account", account_status: 1 }],
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/meta-ads/oauth/start`, {
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
      `${baseUrl}/v1/integrations/meta-ads/oauth/callback?state=${encodeURIComponent(started.state)}&code=meta-code`,
      { redirect: "manual" }
    )

    // Force the stored token to look like it's about to expire (inside the 5-day renewal
    // window), so the next resolveAccessToken() call is forced down the renewal path.
    await database.query(
      `update meta_oauth_connections set token_expires_at = now() + interval '1 day' where id = $1`,
      [started.connectionId]
    )

    mockMetaGraphResponses({
      baseUrl,
      accessToken: "unused",
      longLivedToken: "meta-long-renewal-refreshed",
      adAccounts: [],
    })

    const repository = new MetaOAuthRepository(database)
    const service = new MetaOAuthService(repository)
    const renewedToken = await service.resolveAccessToken(started.connectionId)
    expect(renewedToken).toBe("meta-long-renewal-refreshed")

    const row = await database.query<{ encrypted_access_token: string }>(
      `select encrypted_access_token from meta_oauth_connections where id = $1`,
      [started.connectionId]
    )
    const decrypted = await service.decryptAccessTokenForTesting(
      row.rows[0]!.encrypted_access_token
    )
    expect(decrypted).toBe("meta-long-renewal-refreshed")
  })

  it("production endpoint contract: service defaults to Meta's real Graph API OAuth endpoints", () => {
    const repository = new MetaOAuthRepository(database)
    const service = new MetaOAuthService(repository)
    const endpoints = service.getOAuthEndpointsForTesting()

    expect(endpoints.authorizationUrl).toBe("https://www.facebook.com/v21.0/dialog/oauth")
    expect(endpoints.tokenUrl).toBe("https://graph.facebook.com/v21.0/oauth/access_token")
    expect(endpoints.apiBaseUrl).toBe("https://graph.facebook.com/v21.0")
  })
})
