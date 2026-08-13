// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { GoogleAnalyticsIntegrationProvider } from "../integrations/google-analytics/provider"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { MetaAdsIntegrationProvider } from "../integrations/meta-ads/provider"
import { SallaIntegrationProvider } from "../integrations/salla/provider"
import { ShopifyIntegrationProvider } from "../integrations/shopify/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { GoogleAnalyticsOAuthRepository } from "../google-analytics-oauth/repository"
import { GoogleAnalyticsOAuthService } from "../google-analytics-oauth/service"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

interface MockAccountSummaryFixture {
  accountId: string
  accountName: string
  properties: Array<{ propertyId: string; displayName: string }>
}

function mockGoogleAnalyticsResponses(input: {
  baseUrl: string
  accessToken: string
  refreshToken?: string
  accountSummaries: MockAccountSummaryFixture[]
  pageSize?: number
}) {
  const nativeFetch = globalThis.fetch
  const pageSize = input.pageSize ?? (input.accountSummaries.length || 1)

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url === "https://oauth2.googleapis.com/token") {
      const body = typeof init?.body === "string" ? init.body : ""
      const params = new URLSearchParams(body)
      const isRefresh = params.get("grant_type") === "refresh_token"

      if (isRefresh) {
        return new Response(
          JSON.stringify({
            access_token: `${input.accessToken}-refreshed`,
            expires_in: 3600,
            token_type: "Bearer",
            scope: "https://www.googleapis.com/auth/analytics.readonly",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      return new Response(
        JSON.stringify({
          access_token: input.accessToken,
          refresh_token: input.refreshToken ?? "google-analytics-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "https://www.googleapis.com/auth/analytics.readonly",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.startsWith("https://analyticsadmin.googleapis.com/v1beta/accountSummaries")) {
      const parsed = new URL(url)
      const pageToken = parsed.searchParams.get("pageToken")
      const startIndex = pageToken ? Number(pageToken) : 0
      const page = input.accountSummaries.slice(startIndex, startIndex + pageSize)
      const nextIndex = startIndex + pageSize
      const nextPageToken =
        nextIndex < input.accountSummaries.length ? String(nextIndex) : undefined

      return new Response(
        JSON.stringify({
          accountSummaries: page.map((account) => ({
            name: `accountSummaries/${account.accountId}`,
            account: `accounts/${account.accountId}`,
            displayName: account.accountName,
            propertySummaries: account.properties.map((property) => ({
              property: `properties/${property.propertyId}`,
              displayName: property.displayName,
              propertyType: "PROPERTY_TYPE_ORDINARY",
              parent: `accounts/${account.accountId}`,
            })),
          })),
          ...(nextPageToken ? { nextPageToken } : {}),
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

  process.env.GOOGLE_ANALYTICS_CLIENT_ID = "google-analytics-client-id"
  process.env.GOOGLE_ANALYTICS_CLIENT_SECRET = "google-analytics-client-secret"
  process.env.GOOGLE_ANALYTICS_REDIRECT_URI =
    "http://localhost:4000/v1/integrations/google-analytics/oauth/callback"
  process.env.GOOGLE_ANALYTICS_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  // so those dead entries must be overwritten with real ones or they block this provider's turn.
  container.infrastructure.integrations?.register(new SnapchatAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new MetaAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new SallaIntegrationProvider(database))
  container.infrastructure.integrations?.register(new ShopifyIntegrationProvider(database))
  container.infrastructure.integrations?.register(new GoogleAnalyticsIntegrationProvider(database))

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
      fullName: "Google Analytics OAuth Test",
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
     values ($1, $2, 'hash', 'Google Analytics OAuth Test', now()) on conflict (id) do nothing`,
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

describe("google analytics oauth: authorization URL + state generation", () => {
  it("start returns a real Google authorization URL bound to a unique, freshly-generated state", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-authurl@madar.test",
      "GA Auth URL Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000710"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000711",
      label: "GA Auth URL",
    })

    const firstResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId }),
    })
    expect(firstResponse.status).toBe(200)
    const first = (await firstResponse.json()) as { authorizationUrl: string; state: string }
    const url = new URL(first.authorizationUrl)

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(url.searchParams.get("client_id")).toBe("google-analytics-client-id")
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4000/v1/integrations/google-analytics/oauth/callback"
    )
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/analytics.readonly")
    expect(url.searchParams.get("access_type")).toBe("offline")
    expect(url.searchParams.get("prompt")).toBe("consent")
    expect(url.searchParams.get("state")).toBe(first.state)
    expect(first.state.length).toBeGreaterThan(20)

    // A second /start call (e.g. the user re-opening the connect flow) must mint a
    // different, unpredictable state rather than reusing or deriving a static one.
    const secondResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId }),
    })
    const second = (await secondResponse.json()) as { state: string }
    expect(second.state).not.toBe(first.state)

    const stateRows = await database.query<{ state: string; user_id: string; status: string }>(
      `select state, user_id, status from google_analytics_oauth_states where state = $1`,
      [first.state]
    )
    expect(stateRows.rows).toHaveLength(1)
    expect(stateRows.rows[0]?.user_id).toBe(actor.userId)
    expect(stateRows.rows[0]?.status).toBe("pending")
  })

  it("rejects start from a non-owner/admin actor", async () => {
    const { actor } = await registerAndProvisionOrg("ga-forbidden@madar.test", "GA Forbidden Org")
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000712"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000713",
      label: "GA Forbidden",
    })

    const provider = new GoogleAnalyticsIntegrationProvider(database)
    const viewerActor = { ...actor, workspaceId, roles: ["viewer" as const] }

    await expect(provider.oauthStart(viewerActor, { workspaceId })).rejects.toThrow(
      "GOOGLE_ANALYTICS_OAUTH_FORBIDDEN"
    )
  })
})

describe("google analytics oauth: callback + state validation", () => {
  it("full flow: start -> callback -> access_token and refresh_token persisted encrypted, GA4 properties discovered", async () => {
    const { login, actor } = await registerAndProvisionOrg("ga-http@madar.test", "GA HTTP Org")
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000720"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000721",
      label: "GA HTTP",
    })

    mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-token",
      refreshToken: "ga-refresh-token",
      accountSummaries: [
        {
          accountId: "111",
          accountName: "Madar Account",
          properties: [
            { propertyId: "998877", displayName: "Madar Test Property" },
            { propertyId: "998878", displayName: "Madar Second Property" },
          ],
        },
      ],
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, connectionName: "GA Property" }),
    })
    expect(startResponse.status).toBe(200)
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=ga-code`,
      { redirect: "manual" }
    )
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("google_analytics_oauth=connected")

    const connectionRows = await database.query<{
      status: string
      encrypted_access_token: string | null
      encrypted_refresh_token: string | null
      provider_account_id: string | null
    }>(
      `select status, encrypted_access_token, encrypted_refresh_token, provider_account_id
       from google_analytics_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("connected")
    expect(connectionRows.rows[0]?.encrypted_access_token).toBeTruthy()
    expect(connectionRows.rows[0]?.encrypted_refresh_token).toBeTruthy()
    // Tokens must be encrypted at rest, never stored as the plaintext value from Google.
    expect(connectionRows.rows[0]?.encrypted_access_token).not.toBe("ga-access-token")
    expect(connectionRows.rows[0]?.encrypted_refresh_token).not.toBe("ga-refresh-token")
    expect(connectionRows.rows[0]?.provider_account_id).toBe("998877")

    const repository = new GoogleAnalyticsOAuthRepository(database)
    const service = new GoogleAnalyticsOAuthService(repository)
    const decryptedAccess = await service.decryptAccessTokenForTesting(
      connectionRows.rows[0]!.encrypted_access_token!
    )
    const decryptedRefresh = await service.decryptRefreshTokenForTesting(
      connectionRows.rows[0]!.encrypted_refresh_token!
    )
    expect(decryptedAccess).toBe("ga-access-token")
    expect(decryptedRefresh).toBe("ga-refresh-token")

    // GA4 property discovery: both properties under the account were found and persisted.
    const propertyRows = await database.query<{ account_id: string; account_name: string | null }>(
      `select account_id, account_name from google_analytics_properties where connection_id = $1 order by account_id`,
      [started.connectionId]
    )
    expect(propertyRows.rows).toHaveLength(2)
    expect(propertyRows.rows.map((r) => r.account_id)).toEqual(["998877", "998878"])
    expect(propertyRows.rows[0]?.account_name).toBe("Madar Test Property")

    const accountsResponse = await fetch(
      `${baseUrl}/v1/integrations/google-analytics/accounts?connectionId=${started.connectionId}`,
      {
        headers: {
          authorization: `Bearer ${login.session.accessToken}`,
          "x-workspace-id": workspaceId,
        },
      }
    )
    expect(accountsResponse.status).toBe(200)
    const accountsBody = (await accountsResponse.json()) as { items: Array<{ customerId: string }> }
    expect(accountsBody.items.map((item) => item.customerId).sort()).toEqual(["998877", "998878"])
  })

  it("paginates through accountSummaries when GA4 returns more than one page", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-pagination@madar.test",
      "GA Pagination Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000730"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000731",
      label: "GA Pagination",
    })

    mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-pagination",
      accountSummaries: [
        {
          accountId: "1",
          accountName: "Account One",
          properties: [{ propertyId: "10", displayName: "Property Ten" }],
        },
        {
          accountId: "2",
          accountName: "Account Two",
          properties: [{ propertyId: "20", displayName: "Property Twenty" }],
        },
        {
          accountId: "3",
          accountName: "Account Three",
          properties: [{ propertyId: "30", displayName: "Property Thirty" }],
        },
      ],
      pageSize: 1,
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
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
      `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=ga-code`,
      { redirect: "manual" }
    )

    const propertyRows = await database.query<{ account_id: string }>(
      `select account_id from google_analytics_properties where connection_id = $1`,
      [started.connectionId]
    )
    expect(propertyRows.rows.map((r) => r.account_id).sort()).toEqual(["10", "20", "30"])
  })

  it("rejects a callback with a missing or garbage state", async () => {
    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=not-a-real-state&code=ga-code`,
      { redirect: "manual" }
    )
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("reason=state_invalid")
  })

  it("rejects a callback with an expired state", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-expired@madar.test",
      "GA Expired Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000740"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000741",
      label: "GA Expired",
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId }),
    })
    const started = (await startResponse.json()) as { state: string }

    await database.query(
      `update google_analytics_oauth_states set expires_at = now() - interval '1 hour' where state = $1`,
      [started.state]
    )

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=ga-code`,
      { redirect: "manual" }
    )
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("reason=state_expired")
  })

  it("rejects a reused state (second callback with the same state after a successful first one)", async () => {
    const { login, actor } = await registerAndProvisionOrg("ga-reused@madar.test", "GA Reused Org")
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000750"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000751",
      label: "GA Reused",
    })

    mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-reused",
      accountSummaries: [
        {
          accountId: "1",
          accountName: "Account",
          properties: [{ propertyId: "10", displayName: "Property" }],
        },
      ],
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId }),
    })
    const started = (await startResponse.json()) as { state: string }
    const callbackUrl = `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=ga-code`

    const firstCallback = await fetch(callbackUrl, { redirect: "manual" })
    expect(firstCallback.status).toBe(302)
    expect(firstCallback.headers.get("location")).toContain("google_analytics_oauth=connected")

    const secondCallback = await fetch(callbackUrl, { redirect: "manual" })
    expect(secondCallback.status).toBe(302)
    expect(secondCallback.headers.get("location")).toContain("reason=state_invalid")
  })

  it("propagates a Google token-exchange failure as an error redirect, without persisting a connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-tokenfail@madar.test",
      "GA Token Fail Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000760"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000761",
      label: "GA Token Fail",
    })

    const nativeFetch = globalThis.fetch
    vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
      const url = typeof rawInput === "string" ? rawInput : rawInput.toString()
      if (url.startsWith(baseUrl)) {
        return nativeFetch(rawInput, init)
      }
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
      }
      return new Response("{}", { status: 404 })
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId }),
    })
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=bad-code`,
      { redirect: "manual" }
    )
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("reason=token_exchange_failed")

    const connectionRows = await database.query<{ status: string }>(
      `select status from google_analytics_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("pending")
  })
})

describe("google analytics oauth: token refresh", () => {
  it("resolveAccessToken uses the refresh_token grant when the stored access token is expired, and persists the new one", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-refresh@madar.test",
      "GA Refresh Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000770"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000771",
      label: "GA Refresh",
    })

    mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-initial",
      refreshToken: "ga-refresh-initial",
      accountSummaries: [
        {
          accountId: "1",
          accountName: "Account",
          properties: [{ propertyId: "10", displayName: "Property" }],
        },
      ],
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
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
      `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=ga-code`,
      { redirect: "manual" }
    )

    // Force the stored token to look already-expired so resolveAccessToken() must refresh.
    await database.query(
      `update google_analytics_oauth_connections set token_expires_at = now() - interval '1 hour' where id = $1`,
      [started.connectionId]
    )

    const repository = new GoogleAnalyticsOAuthRepository(database)
    const service = new GoogleAnalyticsOAuthService(repository)
    const refreshedToken = await service.resolveAccessToken(started.connectionId)
    expect(refreshedToken).toBe("ga-access-initial-refreshed")

    const refreshedRows = await database.query<{
      encrypted_access_token: string
      encrypted_refresh_token: string
    }>(
      `select encrypted_access_token, encrypted_refresh_token from google_analytics_oauth_connections where id = $1`,
      [started.connectionId]
    )
    const persistedAccess = await service.decryptAccessTokenForTesting(
      refreshedRows.rows[0]!.encrypted_access_token
    )
    expect(persistedAccess).toBe("ga-access-initial-refreshed")
    // Google did not return a new refresh_token on this refresh -- the original one must
    // still be the one persisted (never dropped just because refresh didn't reissue it).
    const persistedRefresh = await service.decryptRefreshTokenForTesting(
      refreshedRows.rows[0]!.encrypted_refresh_token
    )
    expect(persistedRefresh).toBe("ga-refresh-initial")
  })

  it("resolveAccessToken returns the cached token without a network call when it is not near expiry", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-noop-refresh@madar.test",
      "GA No-op Refresh Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000780"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000781",
      label: "GA No-op Refresh",
    })

    const fetchSpy = mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-fresh",
      accountSummaries: [
        {
          accountId: "1",
          accountName: "Account",
          properties: [{ propertyId: "10", displayName: "Property" }],
        },
      ],
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
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
      `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=ga-code`,
      { redirect: "manual" }
    )

    const callsAfterConnect = fetchSpy.mock.calls.length

    const repository = new GoogleAnalyticsOAuthRepository(database)
    const service = new GoogleAnalyticsOAuthService(repository)
    const token = await service.resolveAccessToken(started.connectionId)
    expect(token).toBe("ga-access-fresh")
    expect(fetchSpy.mock.calls.length).toBe(callsAfterConnect)
  })
})

describe("google analytics oauth: workspace isolation + lifecycle", () => {
  it("a connection created in one workspace is not accessible from a different workspace in the same organization", async () => {
    const { actor } = await registerAndProvisionOrg(
      "ga-workspace-isolation@madar.test",
      "GA Isolation Org"
    )

    const workspaceAId = "00000000-0000-4000-8000-000000000790"
    const workspaceBId = "00000000-0000-4000-8000-000000000791"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId: workspaceAId,
      projectId: "00000000-0000-4000-8000-000000000792",
      label: "GA Workspace A",
    })
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId: workspaceBId,
      projectId: "00000000-0000-4000-8000-000000000793",
      label: "GA Workspace B",
    })

    const actorInWorkspaceA = { ...actor, workspaceId: workspaceAId, roles: ["owner" as const] }
    const actorInWorkspaceB = { ...actor, workspaceId: workspaceBId, roles: ["owner" as const] }

    const provider = new GoogleAnalyticsIntegrationProvider(database)
    const started = await provider.oauthStart(actorInWorkspaceA, { workspaceId: workspaceAId })
    const connectionId = (started as { connectionId: string }).connectionId

    await expect(provider.listAccounts(actorInWorkspaceB, { connectionId })).rejects.toMatchObject({
      code: "GOOGLE_ANALYTICS_CONNECTION_NOT_FOUND",
      status: 404,
    })

    await expect(provider.pause?.(actorInWorkspaceB, { connectionId })).rejects.toThrow(
      "GOOGLE_ANALYTICS_OAUTH_CONNECTION_NOT_FOUND"
    )

    const pauseResult = (await provider.pause?.(actorInWorkspaceA, { connectionId })) as {
      status: string
    }
    expect(pauseResult.status).toBe("paused")
  })

  it("lifecycle: pause, resume, disconnect (soft delete), and hard delete all work over HTTP", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-lifecycle@madar.test",
      "GA Lifecycle Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000794"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000795",
      label: "GA Lifecycle",
    })

    mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-lifecycle",
      accountSummaries: [
        {
          accountId: "1",
          accountName: "Account",
          properties: [{ propertyId: "10", displayName: "Property" }],
        },
      ],
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
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
      `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=ga-code`,
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

    const remaining = await database.query(
      `select id from google_analytics_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(remaining.rows).toHaveLength(0)
  })
})

describe("google analytics oauth: production endpoint contract", () => {
  it("service defaults to Google's real OAuth + GA4 Admin API endpoints and this codebase's production redirect URI convention", () => {
    const repository = new GoogleAnalyticsOAuthRepository(database)
    const service = new GoogleAnalyticsOAuthService(repository)
    const endpoints = service.getOAuthEndpointsForTesting()

    expect(endpoints.authorizationUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(endpoints.tokenUrl).toBe("https://oauth2.googleapis.com/token")
    expect(endpoints.adminApiBaseUrl).toBe("https://analyticsadmin.googleapis.com/v1beta")
  })

  it("production redirect URI follows this codebase's api.madar.my convention when configured", async () => {
    // GOOGLE_ANALYTICS_REDIRECT_URI (set in beforeEach for the local callback) always wins
    // over the constructor's default -- clear it here to prove the production value below
    // is what actually gets used when no local override is present, exactly like every
    // other provider's loadResolvedConfig() precedence (env > credentials > constructor default).
    delete process.env.GOOGLE_ANALYTICS_REDIRECT_URI

    const { actor } = await registerAndProvisionOrg(
      "ga-prod-redirect@madar.test",
      "GA Prod Redirect Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000799"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000798",
      label: "GA Prod Redirect",
    })

    const repository = new GoogleAnalyticsOAuthRepository(database)
    const service = new GoogleAnalyticsOAuthService(repository, {
      redirectUri: "https://api.madar.my/v1/integrations/google-analytics/oauth/callback",
    })

    const started = await service.startAuthorization({ ...actor, workspaceId }, { workspaceId })
    const url = new URL(started.authorizationUrl)
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.madar.my/v1/integrations/google-analytics/oauth/callback"
    )
  })
})
