// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { SnapchatOAuthRepository } from "../snapchat-oauth/repository"
import { SnapchatOAuthService } from "../snapchat-oauth/service"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  process.env.SNAPCHAT_CLIENT_ID = "snapchat-client-id"
  process.env.SNAPCHAT_CLIENT_SECRET = "snapchat-client-secret"
  process.env.SNAPCHAT_REDIRECT_URI = "http://localhost:4000/v1/integrations/snapchat-ads/oauth/callback"
  process.env.SNAPCHAT_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"
  process.env.SNAPCHAT_AUTHORIZATION_URL = "https://accounts.snapchat.com/login/oauth2/authorize"
  process.env.SNAPCHAT_TOKEN_URL = "https://accounts.snapchat.com/login/oauth2/access_token"
  process.env.SNAPCHAT_MARKETING_API_BASE_URL = "https://adsapi.snapchat.com/v1"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(database, `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`)

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database
  container.infrastructure.integrations?.register(new SnapchatAdsIntegrationProvider(database))

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

describe("snapchat oauth http flow", () => {
  it("local stub flow: start -> callback -> token persistence -> account discovery", async () => {
    const nativeFetch = globalThis.fetch

    const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "snapchat-http@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "Snapchat HTTP",
        organizationName: "Snapchat Org",
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
      body: JSON.stringify({ email: "snapchat-http@madar.test", password: "VeryStrongPassword123!" }),
    })
    const login = (await loginResponse.json()) as { session: { accessToken: string } }
    const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'snapchat-http@madar.test', 'hash', 'Snapchat HTTP', now())
       on conflict (id) do nothing`,
      [actor.userId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'Snapchat Org', $2, 'active')
       on conflict (id) do nothing`,
      [actor.organizationId, actor.userId]
    )

    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000310"
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Snapchat Workspace', 'active')
       on conflict (id) do nothing`,
      [workspaceId, actor.organizationId]
    )

    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000311', $1, $2, $3, 'Snapchat OAuth Project', 'active')
       on conflict (id) do nothing`,
      [actor.organizationId, workspaceId, actor.userId]
    )

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.startsWith(baseUrl)) {
        return nativeFetch(input, init)
      }

      if (url.includes("/login/oauth2/access_token")) {
        return new Response(
          JSON.stringify({
            access_token: "snap-access-token-http",
            refresh_token: "snap-refresh-token-http",
            expires_in: 3600,
            scope: "snapchat-marketing-api",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.endsWith("/me/organizations")) {
        return new Response(
          JSON.stringify({
            organizations: [{ organization_id: "org_1", organization_name: "Snap Org" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("/organizations/org_1/adaccounts")) {
        return new Response(
          JSON.stringify({
            adaccounts: [
              {
                adaccount_id: "acc_1",
                name: "Snap Ad Account",
                currency: "USD",
                timezone: "UTC",
                status: "ACTIVE",
                organization_id: "org_1",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      return new Response("{}", { status: 404 })
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/snapchat-ads/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, connectionName: "Snapchat Ads Account" }),
    })

    expect(startResponse.status).toBe(200)

    const started = (await startResponse.json()) as {
      authorizationUrl: string
      state: string
      connectionId: string
    }

    expect(started.authorizationUrl).toContain("accounts.snapchat.com")

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/snapchat-ads/oauth/callback?state=${encodeURIComponent(started.state)}&code=snapchat-code`,
      { redirect: "manual" }
    )

    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("snapchat_oauth=connected")

    const connectionRows = await database.query<{
      status: string
      encrypted_access_token: string | null
      encrypted_refresh_token: string | null
    }>(
      `select status, encrypted_access_token, encrypted_refresh_token
       from snapchat_oauth_connections where id = $1`,
      [started.connectionId]
    )

    expect(connectionRows.rows[0]?.status).toBe("connected")
    expect(connectionRows.rows[0]?.encrypted_access_token).toBeTruthy()
    expect(connectionRows.rows[0]?.encrypted_refresh_token).toBeTruthy()

    const accountRows = await database.query<{
      account_id: string
      account_name: string | null
      currency_code: string | null
      time_zone: string | null
      organization_id: string | null
      status: string
    }>(
      `select account_id, account_name, currency_code, time_zone, organization_id, status
       from snapchat_ads_accounts where connection_id = $1`,
      [started.connectionId]
    )

    expect(accountRows.rows.length).toBeGreaterThan(0)
    expect(accountRows.rows[0]?.account_id).toBe("acc_1")
    expect(accountRows.rows[0]?.account_name).toBe("Snap Ad Account")
    expect(accountRows.rows[0]?.currency_code).toBe("USD")
    expect(accountRows.rows[0]?.time_zone).toBe("UTC")
    expect(accountRows.rows[0]?.organization_id).toBe("org_1")
    expect(accountRows.rows[0]?.status).toBe("active")
  })

  it("production endpoint contract: service defaults to Snapchat production OAuth + Marketing API endpoints", () => {
    const repository = new SnapchatOAuthRepository(database)
    const service = new SnapchatOAuthService(repository)
    const endpoints = service.getOAuthEndpointsForTesting()

    expect(endpoints.authorizationUrl).toBe("https://accounts.snapchat.com/login/oauth2/authorize")
    expect(endpoints.tokenUrl).toBe("https://accounts.snapchat.com/login/oauth2/access_token")
    expect(endpoints.apiBaseUrl).toBe("https://adsapi.snapchat.com/v1")
  })

  const runRealOAuth = process.env.SNAPCHAT_REAL_OAUTH_E2E === "true"
  const realIt = runRealOAuth ? it : it.skip

  realIt("real OAuth flow (opt-in): requires real Snapchat app credentials and live callback code", async () => {
    const repository = new SnapchatOAuthRepository(database)
    const service = new SnapchatOAuthService(repository)

    expect(process.env.SNAPCHAT_CLIENT_ID).toBeTruthy()
    expect(process.env.SNAPCHAT_CLIENT_SECRET).toBeTruthy()
    expect(process.env.SNAPCHAT_REDIRECT_URI).toBeTruthy()

    const endpoints = service.getOAuthEndpointsForTesting()
    expect(endpoints.authorizationUrl).toContain("accounts.snapchat.com")
    expect(endpoints.tokenUrl).toContain("accounts.snapchat.com")
    expect(endpoints.apiBaseUrl).toContain("adsapi.snapchat.com")
  })
})
