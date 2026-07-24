// @vitest-environment node

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { StaticGoogleIdentityCredentialsProvider } from "../google-oauth/google-identity-credentials"
import { GoogleOAuthRepository } from "../google-oauth/repository"
import { GoogleOAuthService } from "../google-oauth/service"

const ACTOR = {
  userId: "1f094f77-26e0-4321-b7bc-c90bbc17f001",
  sessionId: "session-test",
  organizationId: "0ef62f6e-8d8b-420d-b2bc-70a0d4282c77",
  workspaceId: "769cbf82-5945-40b2-a0c0-4fbc59a8d2dd",
  roles: ["owner" as const],
}
const PROJECT_ID = "01f088b8-8a6f-490c-840b-cce24e975c69"
const googleCredentialsProvider = new StaticGoogleIdentityCredentialsProvider({
  clientId: "google-client-id",
  clientSecret: "google-client-secret",
  developerToken: "developer-token-test",
  redirectUri: "http://localhost:4000/v1/integrations/google/oauth/callback",
})

let database: PostgresDatabase

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

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'owner@madar.test', 'hash', 'Owner User', now())`,
    [ACTOR.userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Org', $2, 'active')`,
    [ACTOR.organizationId, ACTOR.userId]
  )
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, 'Workspace', 'active')`,
    [ACTOR.workspaceId, ACTOR.organizationId]
  )
  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, 'Project', 'active')`,
    [PROJECT_ID, ACTOR.organizationId, ACTOR.workspaceId, ACTOR.userId]
  )
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.end()
})

describe("google oauth service", () => {
  it("starts oauth, exchanges code, and persists encrypted tokens with audit evidence", async () => {
    const service = new GoogleOAuthService(new GoogleOAuthRepository(database), undefined, googleCredentialsProvider)

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString()

        if (url.includes("oauth2.googleapis.com/token")) {
          return new Response(
            JSON.stringify({
              access_token: "token-access-1",
              refresh_token: "token-refresh-1",
              expires_in: 3600,
              scope:
                "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email",
              token_type: "Bearer",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        }

        if (url.includes("www.googleapis.com/oauth2/v2/userinfo")) {
          return new Response(
            JSON.stringify({ id: "acct-1", email: "ads-user@example.com", name: "Ads User" }),
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

    const started = await service.startAuthorization(ACTOR, {
      workspaceId: ACTOR.workspaceId,
      projectId: PROJECT_ID,
      connectionName: "MADAR Google Ads",
    })

    expect(started.authorizationUrl).toContain("accounts.google.com")
    expect(started.authorizationUrl).toContain("access_type=offline")
    expect(started.state.length).toBeGreaterThan(10)

    const completed = await service.completeAuthorization({
      state: started.state,
      code: "oauth-code-123",
    })

    expect(completed.status).toBe("connected")
    expect(completed.accountName).toBe("Ads User")

    const persisted = await database.query<{
      status: string
      project_id: string
      provider_email: string | null
    }>(
      `
        select c.status, c.project_id, a.provider_email
        from integration_connections c
        left join oauth_accounts a on a.id = c.oauth_account_id
        where c.id = $1
      `,
      [started.connectionId]
    )
    expect(persisted.rows[0]?.status).toBe("connected")
    expect(persisted.rows[0]?.project_id).toBe(PROJECT_ID)
    expect(persisted.rows[0]?.provider_email).toBe("ads-user@example.com")

    const tokenResult = await database.query<{ encrypted_refresh_token: string | null }>(
      `
        select t.encrypted_refresh_token
        from oauth_tokens t
        join integration_connections c on c.oauth_account_id = t.oauth_account_id
        where c.id = $1 and t.status = 'active'
        order by t.updated_at desc
        limit 1
      `,
      [started.connectionId]
    )
    const encryptedRefresh = tokenResult.rows[0]?.encrypted_refresh_token
    expect(encryptedRefresh).toBeTruthy()
    expect(encryptedRefresh).not.toContain("token-refresh-1")

    const decryptedRefresh = await service.decryptRefreshTokenForTesting(String(encryptedRefresh))
    expect(decryptedRefresh).toBe("token-refresh-1")

    const dataSourceCount = await database.query<{ count: string }>(
      "select count(*)::text as count from data_sources where project_id = $1 and type = 'google_ads'",
      [PROJECT_ID]
    )
    expect(Number(dataSourceCount.rows[0]?.count ?? "0")).toBe(0)

    const auditCount = await database.query<{ count: string }>(
      "select count(*)::text as count from audit_logs where action like 'integration.google_oauth.%'"
    )
    expect(Number(auditCount.rows[0]?.count ?? "0")).toBeGreaterThanOrEqual(2)

    const eventCount = await database.query<{ count: string }>(
      "select count(*)::text as count from google_oauth_events where connection_id = $1",
      [started.connectionId]
    )
    expect(Number(eventCount.rows[0]?.count ?? "0")).toBeGreaterThanOrEqual(2)

    expect(fetchMock).toHaveBeenCalled()
  })

  it("rejects invalid and expired states", async () => {
    const service = new GoogleOAuthService(new GoogleOAuthRepository(database), undefined, googleCredentialsProvider)

    await expect(service.completeAuthorization({
      state: "missing-state",
      code: "oauth-code",
    })).rejects.toThrow("GOOGLE_OAUTH_STATE_INVALID")

    const started = await service.startAuthorization(ACTOR, {
      workspaceId: ACTOR.workspaceId,
      projectId: PROJECT_ID,
    })

    await database.query(
      "update oauth_states set expires_at = now() - interval '1 minute' where state = $1",
      [started.state]
    )

    await expect(service.completeAuthorization({
      state: started.state,
      code: "oauth-code",
    })).rejects.toThrow("GOOGLE_OAUTH_STATE_EXPIRED")
  })

  it("handles duplicate callback safely by consuming state once", async () => {
    const service = new GoogleOAuthService(new GoogleOAuthRepository(database), undefined, googleCredentialsProvider)

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token-access-dup",
            refresh_token: "token-refresh-dup",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("www.googleapis.com/oauth2/v2/userinfo")) {
        return new Response(
          JSON.stringify({ id: "acct-dup", email: "dup@example.com", name: "Dup" }),
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

    const started = await service.startAuthorization(ACTOR, {
      workspaceId: ACTOR.workspaceId,
      projectId: PROJECT_ID,
    })

    await service.completeAuthorization({ state: started.state, code: "oauth-code" })

    await expect(service.completeAuthorization({
      state: started.state,
      code: "oauth-code",
    })).rejects.toThrow("GOOGLE_OAUTH_STATE_INVALID")
  })

  it("fails on invalid authorization code and provider token errors", async () => {
    const service = new GoogleOAuthService(new GoogleOAuthRepository(database), undefined, googleCredentialsProvider)
    const started = await service.startAuthorization(ACTOR, {
      workspaceId: ACTOR.workspaceId,
      projectId: PROJECT_ID,
    })

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
      }

      return new Response("{}", { status: 404 })
    })

    await expect(service.completeAuthorization({
      state: started.state,
      code: "bad-code",
    })).rejects.toThrow("GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED")
  })

  it("fails if refresh token missing or granted scopes are incomplete", async () => {
    const service = new GoogleOAuthService(new GoogleOAuthRepository(database), undefined, googleCredentialsProvider)

    const startedMissingRefresh = await service.startAuthorization(ACTOR, {
      workspaceId: ACTOR.workspaceId,
      projectId: PROJECT_ID,
    })

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token-access-no-refresh",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("www.googleapis.com/oauth2/v2/userinfo")) {
        return new Response(JSON.stringify({ id: "acct-nr", email: "nr@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      if (url.includes("customers:listAccessibleCustomers")) {
        return new Response(
          JSON.stringify({ resourceNames: ["customers/123"] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      return new Response("{}", { status: 404 })
    })

    await expect(service.completeAuthorization({
      state: startedMissingRefresh.state,
      code: "oauth-code",
    })).rejects.toThrow("GOOGLE_OAUTH_REFRESH_TOKEN_MISSING")

    vi.restoreAllMocks()

    const startedMissingScope = await service.startAuthorization(ACTOR, {
      workspaceId: ACTOR.workspaceId,
      projectId: PROJECT_ID,
    })

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token-access-missing-scope",
            refresh_token: "token-refresh-missing-scope",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/userinfo.email",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("www.googleapis.com/oauth2/v2/userinfo")) {
        return new Response(JSON.stringify({ id: "acct-ms", email: "ms@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      if (url.includes("customers:listAccessibleCustomers")) {
        return new Response(
          JSON.stringify({ resourceNames: ["customers/123"] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      return new Response("{}", { status: 404 })
    })

    await expect(service.completeAuthorization({
      state: startedMissingScope.state,
      code: "oauth-code",
    })).rejects.toThrow("GOOGLE_OAUTH_SCOPE_VALIDATION_FAILED")
  })

  it("fails safely on database write failure and invalid encryption configuration", async () => {
    const repository = new GoogleOAuthRepository(database)
    const service = new GoogleOAuthService(repository, undefined, googleCredentialsProvider)

    const started = await service.startAuthorization(ACTOR, {
      workspaceId: ACTOR.workspaceId,
      projectId: PROJECT_ID,
    })

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token-access-db-fail",
            refresh_token: "token-refresh-db-fail",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("www.googleapis.com/oauth2/v2/userinfo")) {
        return new Response(JSON.stringify({ id: "acct-db", email: "db@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      if (url.includes("customers:listAccessibleCustomers")) {
        return new Response(
          JSON.stringify({ resourceNames: ["customers/123"] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      return new Response("{}", { status: 404 })
    })

    vi.spyOn(repository, "upsertConnection").mockRejectedValueOnce(new Error("db down"))

    await expect(service.completeAuthorization({
      state: started.state,
      code: "oauth-code",
    })).rejects.toThrow("db down")

    const connectionRow = await database.query<{ status: string }>(
      "select status from integration_connections where id = $1",
      [started.connectionId]
    )
    expect(connectionRow.rows[0]?.status).toBe("pending")

    const completedAudit = await database.query<{ count: string }>(
      "select count(*)::text as count from audit_logs where entity_id = $1 and action = 'integration.google_oauth.connected'",
      [started.connectionId]
    )
    expect(Number(completedAudit.rows[0]?.count ?? "0")).toBe(0)

    const invalidKeyService = new GoogleOAuthService(
      new GoogleOAuthRepository(database),
      { tokenEncryptionKey: "short-key" },
      googleCredentialsProvider
    )

    await expect(invalidKeyService.startAuthorization(ACTOR, {
      workspaceId: ACTOR.workspaceId,
      projectId: PROJECT_ID,
    })).rejects.toThrow("GOOGLE_OAUTH_CONFIGURATION_ERROR")
  })

  it("allows only one successful completion for concurrent callbacks", async () => {
    const service = new GoogleOAuthService(new GoogleOAuthRepository(database), undefined, googleCredentialsProvider)

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString()

      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "token-access-concurrent",
            refresh_token: "token-refresh-concurrent",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }

      if (url.includes("www.googleapis.com/oauth2/v2/userinfo")) {
        return new Response(
          JSON.stringify({ id: "acct-concurrent", email: "concurrent@example.com", name: "Concurrent" }),
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

    const started = await service.startAuthorization(ACTOR, {
      workspaceId: ACTOR.workspaceId,
      projectId: PROJECT_ID,
    })

    const [first, second] = await Promise.allSettled([
      service.completeAuthorization({ state: started.state, code: "oauth-code" }),
      service.completeAuthorization({ state: started.state, code: "oauth-code" }),
    ])

    const fulfilledCount = [first, second].filter((result) => result.status === "fulfilled").length
    const rejectedCount = [first, second].filter((result) => result.status === "rejected").length
    expect(fulfilledCount).toBe(1)
    expect(rejectedCount).toBe(1)

    const connectedAudit = await database.query<{ count: string }>(
      "select count(*)::text as count from audit_logs where entity_id = $1 and action = 'integration.google_oauth.connected'",
      [started.connectionId]
    )
    expect(Number(connectedAudit.rows[0]?.count ?? "0")).toBe(1)
  })
})
