// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { GoogleAdsIntegrationProvider } from "../integrations/google-ads/provider"
import { GoogleAdsSyncService } from "../google-ads/sync-service"
import { StaticGoogleIdentityCredentialsProvider } from "../google-oauth/google-identity-credentials"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID = "google-client-id"
  process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret"
  process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI =
    "http://localhost:4000/v1/integrations/google/oauth/callback"
  process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_SUCCESS_REDIRECT_URI =
    "http://localhost:3000/integrations/new"
  process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY =
    "12345678901234567890123456789012"
  process.env.IDENTITY_PLATFORM_GOOGLE_ADS_DEVELOPER_TOKEN = "developer-token-test"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())
  await runSqlFile(database, `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`)

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database
  ;(container.infrastructure as { googleIdentityCredentialsProvider?: StaticGoogleIdentityCredentialsProvider }).googleIdentityCredentialsProvider =
    new StaticGoogleIdentityCredentialsProvider({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      developerToken: "developer-token-test",
      redirectUri: "http://localhost:4000/v1/integrations/google/oauth/callback",
    })
  container.infrastructure.integrations?.register(
    new GoogleAdsIntegrationProvider(
      new GoogleAdsSyncService(
        database,
        {
          apiBaseUrl: "https://googleads.googleapis.com/v17",
          tokenEndpoint: "https://oauth2.googleapis.com/token",
          encryptionKey:
            process.env.IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY
            ?? "12345678901234567890123456789012",
          developerToken: process.env.IDENTITY_PLATFORM_GOOGLE_ADS_DEVELOPER_TOKEN ?? "developer-token-test",
          maxRetries: 0,
          minRequestIntervalMs: 0,
        },
        (async () => new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch
      )
    )
  )

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

describe("google oauth http flow", () => {
  it("starts OAuth via API and handles callback redirect", async () => {
    const nativeFetch = globalThis.fetch

    const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "oauth-http@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "OAuth HTTP",
        organizationName: "OAuth Org",
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
      body: JSON.stringify({ email: "oauth-http@madar.test", password: "VeryStrongPassword123!" }),
    })
    const login = (await loginResponse.json()) as { session: { accessToken: string } }
    const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'oauth-http@madar.test', 'hash', 'OAuth HTTP', now())`,
      [actor.userId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'OAuth Org', $2, 'active')`,
      [actor.organizationId, actor.userId]
    )

    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000210"
    if (!actor.workspaceId) {
      await database.query(
        `insert into workspaces (id, organization_id, name, status)
         values ($1, $2, 'OAuth Workspace', 'active')`,
        [workspaceId, actor.organizationId]
      )
    } else {
      await database.query(
        `insert into workspaces (id, organization_id, name, status)
         values ($1, $2, 'OAuth Workspace', 'active')`,
        [actor.workspaceId, actor.organizationId]
      )
    }

    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000123', $1, $2, $3, 'OAuth HTTP Project', 'active')`,
      [actor.organizationId, workspaceId, actor.userId]
    )

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId }),
    })

    expect(startResponse.status).toBe(200)
    const started = (await startResponse.json()) as { authorizationUrl: string; state: string; connectionId: string }
    expect(started.authorizationUrl).toContain("accounts.google.com")

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.startsWith(baseUrl)) {
        return nativeFetch(input, init)
      }

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token-access-http",
            refresh_token: "token-refresh-http",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/adwords",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("www.googleapis.com/oauth2/v2/userinfo")) {
        return new Response(
          JSON.stringify({ id: "acct-http", email: "acct-http@example.com", name: "Acct Http" }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("customers:listAccessibleCustomers")) {
        return new Response(
          JSON.stringify({ resourceNames: ["customers/123"] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      return new Response("{}", { status: 404 })
    })

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/google/oauth/callback?state=${encodeURIComponent(started.state)}&code=oauth-http-code`,
      { redirect: "manual" }
    )

    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("google_oauth=connected")

    const persisted = await database.query<{
      status: string
      encrypted_refresh_token: string | null
    }>(
      `
        select c.status, t.encrypted_refresh_token
        from integration_connections c
        left join oauth_tokens t on t.oauth_account_id = c.oauth_account_id and t.status = 'active'
        where c.id = $1
        order by t.updated_at desc
        limit 1
      `,
      [started.connectionId]
    )
    expect(persisted.rows[0]?.status).toBe("connected")
    expect(persisted.rows[0]?.encrypted_refresh_token).toBeTruthy()

    const auditCount = await database.query<{ count: string }>(
      "select count(*)::text as count from audit_logs where entity_id = $1 and action like 'integration.google_oauth.%'",
      [started.connectionId]
    )
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBeGreaterThan(0)
  })

  it("returns safe callback error reasons for invalid state and invalid grant", async () => {
    const nativeFetch = globalThis.fetch

    const invalidStateResponse = await fetch(
      `${baseUrl}/v1/integrations/google/oauth/callback?state=invalid-state&code=oauth-code`,
      { redirect: "manual" }
    )

    expect(invalidStateResponse.status).toBe(302)
    expect(invalidStateResponse.headers.get("location")).toContain("google_oauth=error")
    expect(invalidStateResponse.headers.get("location")).toContain("reason=state_invalid")

    const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "oauth-http-safe-error@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "OAuth HTTP",
        organizationName: "OAuth Org",
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
      body: JSON.stringify({ email: "oauth-http-safe-error@madar.test", password: "VeryStrongPassword123!" }),
    })
    const login = (await loginResponse.json()) as { session: { accessToken: string } }
    const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'oauth-http-safe-error@madar.test', 'hash', 'OAuth HTTP', now())`,
      [actor.userId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'OAuth Org', $2, 'active')`,
      [actor.organizationId, actor.userId]
    )

    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000211"
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'OAuth Workspace', 'active')`,
      [workspaceId, actor.organizationId]
    )

    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000124', $1, $2, $3, 'OAuth HTTP Project', 'active')`,
      [actor.organizationId, workspaceId, actor.userId]
    )

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId }),
    })
    const started = (await startResponse.json()) as { state: string }

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.startsWith(baseUrl)) {
        return nativeFetch(input, init)
      }

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
      }

      return new Response("{}", { status: 404 })
    })

    const invalidGrantResponse = await fetch(
      `${baseUrl}/v1/integrations/google/oauth/callback?state=${encodeURIComponent(started.state)}&code=bad-code`,
      { redirect: "manual" }
    )

    expect(invalidGrantResponse.status).toBe(302)
    expect(invalidGrantResponse.headers.get("location")).toContain("google_oauth=error")
    expect(invalidGrantResponse.headers.get("location")).toContain("reason=token_exchange_failed")
  })

  it("lists customers, selects one active customer, and returns the selected customer", async () => {
    const nativeFetch = globalThis.fetch

    const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "oauth-http-customers@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "OAuth HTTP Customers",
        organizationName: "OAuth Org",
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
      body: JSON.stringify({ email: "oauth-http-customers@madar.test", password: "VeryStrongPassword123!" }),
    })
    const login = (await loginResponse.json()) as { session: { accessToken: string } }
    const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'oauth-http-customers@madar.test', 'hash', 'OAuth HTTP Customers', now())`,
      [actor.userId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'OAuth Org', $2, 'active')`,
      [actor.organizationId, actor.userId]
    )

    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000218"
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'OAuth Workspace', 'active')`,
      [workspaceId, actor.organizationId]
    )

    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000219', $1, $2, $3, 'OAuth HTTP Customer Project', 'active')`,
      [actor.organizationId, workspaceId, actor.userId]
    )

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, projectId: "00000000-0000-4000-8000-000000000219" }),
    })
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.startsWith(baseUrl)) {
        return nativeFetch(input, init)
      }

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token-access-http-customers",
            refresh_token: "token-refresh-http-customers",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/adwords",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("www.googleapis.com/oauth2/v2/userinfo")) {
        return new Response(
          JSON.stringify({ id: "acct-http-customers", email: "acct-http-customers@example.com", name: "Acct Customers" }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("customers:listAccessibleCustomers")) {
        return new Response(
          JSON.stringify({ resourceNames: ["customers/123", "customers/456-789-0000"] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      return new Response("{}", { status: 404 })
    })

    const callbackResponse = await fetch(
      `${baseUrl}/v1/integrations/google/oauth/callback?state=${encodeURIComponent(started.state)}&code=oauth-http-customer-code`,
      { redirect: "manual" }
    )

    expect(callbackResponse.status).toBe(302)

    const listResponse = await fetch(
      `${baseUrl}/v1/integrations/google-ads/accounts?connectionId=${started.connectionId}`,
      {
        headers: {
          authorization: `Bearer ${login.session.accessToken}`,
          "x-workspace-id": workspaceId,
        },
      }
    )

    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toMatchObject({
      items: [
        { customerId: "123" },
        { customerId: "4567890000" },
      ],
    })

    const selectResponse = await fetch(`${baseUrl}/v1/integrations/google-ads/accounts/select`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ connectionId: started.connectionId, customerId: "4567890000" }),
    })

    expect(selectResponse.status).toBe(200)
    await expect(selectResponse.json()).resolves.toMatchObject({
      status: "connected",
      selectedCustomer: {
        customerId: "4567890000",
        isSelected: true,
      },
    })

    const selectedResponse = await fetch(
      `${baseUrl}/v1/integrations/google-ads/accounts/selected?connectionId=${started.connectionId}`,
      {
        headers: {
          authorization: `Bearer ${login.session.accessToken}`,
          "x-workspace-id": workspaceId,
        },
      }
    )

    expect(selectedResponse.status).toBe(200)
    await expect(selectedResponse.json()).resolves.toMatchObject({
      item: {
        customerId: "4567890000",
        isSelected: true,
      },
    })
  })

  it("handles duplicate callbacks safely", async () => {
    const nativeFetch = globalThis.fetch

    const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "oauth-http-dup@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "OAuth HTTP",
        organizationName: "OAuth Org",
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
      body: JSON.stringify({ email: "oauth-http-dup@madar.test", password: "VeryStrongPassword123!" }),
    })
    const login = (await loginResponse.json()) as { session: { accessToken: string } }
    const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'oauth-http-dup@madar.test', 'hash', 'OAuth HTTP', now())`,
      [actor.userId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'OAuth Org', $2, 'active')`,
      [actor.organizationId, actor.userId]
    )

    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000212"
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'OAuth Workspace', 'active')`,
      [workspaceId, actor.organizationId]
    )

    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000125', $1, $2, $3, 'OAuth HTTP Project', 'active')`,
      [actor.organizationId, workspaceId, actor.userId]
    )

    const startResponse = await fetch(`${baseUrl}/v1/integrations/google/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId }),
    })

    const started = (await startResponse.json()) as { state: string }

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.startsWith(baseUrl)) {
        return nativeFetch(input, init)
      }

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token-access-dup-http",
            refresh_token: "token-refresh-dup-http",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("www.googleapis.com/oauth2/v2/userinfo")) {
        return new Response(
          JSON.stringify({ id: "acct-http-dup", email: "acct-http-dup@example.com", name: "Acct Dup" }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("customers:listAccessibleCustomers")) {
        return new Response(
          JSON.stringify({ resourceNames: ["customers/123"] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      return new Response("{}", { status: 404 })
    })

    const callbackOne = await fetch(
      `${baseUrl}/v1/integrations/google/oauth/callback?state=${encodeURIComponent(started.state)}&code=oauth-http-code`,
      { redirect: "manual" }
    )
    expect(callbackOne.status).toBe(302)
    expect(callbackOne.headers.get("location")).toContain("google_oauth=connected")

    const callbackTwo = await fetch(
      `${baseUrl}/v1/integrations/google/oauth/callback?state=${encodeURIComponent(started.state)}&code=oauth-http-code`,
      { redirect: "manual" }
    )
    expect(callbackTwo.status).toBe(302)
    expect(callbackTwo.headers.get("location")).toContain("google_oauth=error")
    expect(callbackTwo.headers.get("location")).toContain("reason=state_invalid")
  })

  it("deletes integration connection via DELETE endpoint", async () => {
    const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "oauth-http-delete@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "OAuth HTTP Delete",
        organizationName: "OAuth Org",
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
      body: JSON.stringify({ email: "oauth-http-delete@madar.test", password: "VeryStrongPassword123!" }),
    })
    const login = (await loginResponse.json()) as { session: { accessToken: string } }
    const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'oauth-http-delete@madar.test', 'hash', 'OAuth HTTP Delete', now())`,
      [actor.userId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'OAuth Org', $2, 'active')`,
      [actor.organizationId, actor.userId]
    )

    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000213"
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'OAuth Workspace', 'active')`,
      [workspaceId, actor.organizationId]
    )

    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000126', $1, $2, $3, 'OAuth HTTP Project', 'active')`,
      [actor.organizationId, workspaceId, actor.userId]
    )

    const connectionId = "00000000-0000-4000-8000-000000000127"
    const oauthAccountId = "00000000-0000-4000-8000-000000000129"
    await database.query(
      `insert into oauth_accounts (
        id, provider_family, organization_id, workspace_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1,'google',$2,$3,'connected',$4,$4,now(),now())`,
      [oauthAccountId, actor.organizationId, workspaceId, actor.userId]
    )
    await database.query(
      `insert into integration_connections (
        id, provider_id, provider_family, platform,
        organization_id, workspace_id, project_id, oauth_account_id,
        status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1,'google-ads','google','marketing',$2,$3,'00000000-0000-4000-8000-000000000126',$4,'connected',$5,$5,now(),now())`,
      [connectionId, actor.organizationId, workspaceId, oauthAccountId, actor.userId]
    )
    await database.query(
      `insert into google_oauth_connections (
        id, organization_id, workspace_id, project_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1,$2,$3,'00000000-0000-4000-8000-000000000126','connected',$4,$4,now(),now())`,
      [connectionId, actor.organizationId, workspaceId, actor.userId]
    )
    await database.query(
      `insert into google_ads_customer_accounts (
        id, connection_id, customer_id, display_name, status, is_selected, discovered_at, created_at, updated_at
      ) values ('00000000-0000-4000-8000-000000000128',$1,'123456','Delete Test','active',true,now(),now(),now())`,
      [connectionId]
    )

    const deleteResponse = await fetch(`${baseUrl}/v1/integrations/${connectionId}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
    })

    expect(deleteResponse.status).toBe(204)

    const connectionCount = await database.query<{ count: string }>(
      "select count(*)::text as count from google_oauth_connections where id = $1",
      [connectionId]
    )
    const accountCount = await database.query<{ count: string }>(
      "select count(*)::text as count from google_ads_customer_accounts where connection_id = $1",
      [connectionId]
    )

    expect(Number(connectionCount.rows[0]?.count ?? "0")).toBe(0)
    expect(Number(accountCount.rows[0]?.count ?? "0")).toBe(0)
  })

  it("returns a typed not-found error when listing records for a deleted connection", async () => {
    const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "oauth-http-records-delete@madar.test",
        password: "VeryStrongPassword123!",
        fullName: "OAuth HTTP Records Delete",
        organizationName: "OAuth Records Org",
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
      body: JSON.stringify({ email: "oauth-http-records-delete@madar.test", password: "VeryStrongPassword123!" }),
    })
    const login = (await loginResponse.json()) as { session: { accessToken: string } }
    const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'oauth-http-records-delete@madar.test', 'hash', 'OAuth HTTP Records Delete', now())`,
      [actor.userId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ($1, 'OAuth Records Org', $2, 'active')`,
      [actor.organizationId, actor.userId]
    )

    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000214"
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'OAuth Records Workspace', 'active')`,
      [workspaceId, actor.organizationId]
    )

    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000215', $1, $2, $3, 'OAuth Records Project', 'active')`,
      [actor.organizationId, workspaceId, actor.userId]
    )

    const connectionId = "00000000-0000-4000-8000-000000000216"
    const oauthAccountId = "00000000-0000-4000-8000-000000000218"
    await database.query(
      `insert into oauth_accounts (
        id, provider_family, organization_id, workspace_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1,'google',$2,$3,'connected',$4,$4,now(),now())`,
      [oauthAccountId, actor.organizationId, workspaceId, actor.userId]
    )
    await database.query(
      `insert into integration_connections (
        id, provider_id, provider_family, platform,
        organization_id, workspace_id, project_id, oauth_account_id,
        status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1,'google-ads','google','marketing',$2,$3,'00000000-0000-4000-8000-000000000215',$4,'connected',$5,$5,now(),now())`,
      [connectionId, actor.organizationId, workspaceId, oauthAccountId, actor.userId]
    )
    await database.query(
      `insert into google_oauth_connections (
        id, organization_id, workspace_id, project_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values ($1,$2,$3,'00000000-0000-4000-8000-000000000215','connected',$4,$4,now(),now())`,
      [connectionId, actor.organizationId, workspaceId, actor.userId]
    )
    await database.query(
      `insert into google_ads_customer_accounts (
        id, connection_id, customer_id, display_name, status, is_selected, discovered_at, created_at, updated_at
      ) values ('00000000-0000-4000-8000-000000000217',$1,'google-ads-1','Delete Test','active',true,now(),now(),now())`,
      [connectionId]
    )

    const deleteResponse = await fetch(`${baseUrl}/v1/integrations/${connectionId}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
    })
    expect(deleteResponse.status).toBe(204)

    const recordsResponse = await fetch(
      `${baseUrl}/v1/integrations/google-ads/records?connectionId=${connectionId}&customerId=google-ads-1`,
      {
        headers: {
          authorization: `Bearer ${login.session.accessToken}`,
          "x-workspace-id": workspaceId,
        },
      }
    )

    expect(recordsResponse.status).toBe(404)
    await expect(recordsResponse.json()).resolves.toMatchObject({
      code: "GOOGLE_ADS_CONNECTION_NOT_FOUND",
    })
  })
})
