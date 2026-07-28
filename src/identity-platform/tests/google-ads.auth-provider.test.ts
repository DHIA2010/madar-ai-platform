// @vitest-environment node

import crypto from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { GoogleAdsAuthProvider } from "../google-ads/auth-provider"
import { StaticGoogleIdentityCredentialsProvider } from "../google-oauth/google-identity-credentials"

function encrypt(plain: string, key: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "utf8"), iv)
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

describe("google ads auth provider", () => {
  let database: PostgresDatabase

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())

    await runIdentityMigrations(database, process.cwd())
    await runSqlFile(database, `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`)

    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ('00000000-0000-4000-8000-000000000201', 'owner@auth.test', 'hash', 'Owner', now())`
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status)
       values ('00000000-0000-4000-8000-000000000202', 'Org', '00000000-0000-4000-8000-000000000201', 'active')`
    )
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000202', 'Ws', 'active')`
    )
    await database.query(
      `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
       values ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000201', 'Project', 'active')`
    )
  })

  it("returns cached access token when not expired and refreshes when expired", async () => {
    const key = "12345678901234567890123456789012"
    const oauthAccountId = "00000000-0000-4000-8000-000000000207"

    await database.query(
      `insert into oauth_accounts (
        id, provider_family, organization_id, workspace_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        $1, 'google', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203', 'connected',
        '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000201', now(), now()
      )`,
      [oauthAccountId]
    )

    await database.query(
      `insert into integration_connections (
        id, provider_id, provider_family, platform,
        organization_id, workspace_id, project_id, oauth_account_id,
        status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000205',
        'google-ads', 'google', 'marketing',
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000203',
        '00000000-0000-4000-8000-000000000204',
        $1,
        'connected',
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000201',
        now(),
        now()
      )`,
      [oauthAccountId]
    )

    await database.query(
      `insert into oauth_tokens (
        id, oauth_account_id, encrypted_access_token, encrypted_refresh_token,
        token_type, token_expires_at, refresh_token_issued_at, status, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000208',
        $1,
        $2,
        $3,
        'Bearer',
        now() + interval '5 minutes',
        now(),
        'active',
        now(),
        now()
      )`,
      [oauthAccountId, encrypt("access-token", key), encrypt("refresh-token", key)]
    )

    await database.query(
      `insert into google_oauth_connections (
        id, organization_id, workspace_id, project_id, encrypted_access_token, encrypted_refresh_token,
        token_expires_at, status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000205',
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000203',
        '00000000-0000-4000-8000-000000000204',
        $1,
        $2,
        now() + interval '5 minutes',
        'connected',
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000201',
        now(),
        now()
      )`,
      [encrypt("access-token", key), encrypt("refresh-token", key)]
    )

    const provider = new GoogleAdsAuthProvider(database, {
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      encryptionKey: key,
    })

    const token = await provider.getAccessToken("00000000-0000-4000-8000-000000000205")
    expect(token).toBe("access-token")
  })

  it("fails when refresh token is missing", async () => {
    const key = "12345678901234567890123456789012"
    const oauthAccountId = "00000000-0000-4000-8000-000000000209"

    await database.query(
      `insert into oauth_accounts (
        id, provider_family, organization_id, workspace_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        $1, 'google', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203', 'connected',
        '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000201', now(), now()
      )`,
      [oauthAccountId]
    )

    await database.query(
      `insert into integration_connections (
        id, provider_id, provider_family, platform,
        organization_id, workspace_id, project_id, oauth_account_id,
        status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000206',
        'google-ads', 'google', 'marketing',
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000203',
        '00000000-0000-4000-8000-000000000204',
        $1,
        'connected',
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000201',
        now(),
        now()
      )`,
      [oauthAccountId]
    )

    await database.query(
      `insert into oauth_tokens (
        id, oauth_account_id, encrypted_access_token,
        token_type, token_expires_at, refresh_token_issued_at, status, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000210',
        $1,
        $2,
        'Bearer',
        now() - interval '5 minutes',
        now(),
        'active',
        now(),
        now()
      )`,
      [oauthAccountId, encrypt("expired-access-token", key)]
    )

    await database.query(
      `insert into google_oauth_connections (
        id, organization_id, workspace_id, project_id, encrypted_access_token,
        token_expires_at, status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000206',
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000203',
        '00000000-0000-4000-8000-000000000204',
        $1,
        now() - interval '5 minutes',
        'connected',
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000201',
        now(),
        now()
      )`,
      [encrypt("expired-access-token", key)]
    )

    const provider = new GoogleAdsAuthProvider(database, {
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      encryptionKey: key,
    })

    await expect(provider.getAccessToken("00000000-0000-4000-8000-000000000206"))
      .rejects.toMatchObject({ code: "GOOGLE_ADS_TOKEN_UNAVAILABLE" })
  })

  it("refreshes access token from oauth_tokens and records refresh history", async () => {
    const key = "12345678901234567890123456789012"
    const oauthAccountId = "00000000-0000-4000-8000-000000000211"

    await database.query(
      `insert into oauth_accounts (
        id, provider_family, organization_id, workspace_id, status,
        created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        $1, 'google', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000203', 'connected',
        '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000201', now(), now()
      )`,
      [oauthAccountId]
    )

    await database.query(
      `insert into integration_connections (
        id, provider_id, provider_family, platform,
        organization_id, workspace_id, project_id, oauth_account_id,
        status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000212',
        'google-ads', 'google', 'marketing',
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000203',
        '00000000-0000-4000-8000-000000000204',
        $1,
        'connected',
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000201',
        now(),
        now()
      )`,
      [oauthAccountId]
    )

    await database.query(
      `insert into oauth_tokens (
        id, oauth_account_id, encrypted_access_token, encrypted_refresh_token,
        token_type, token_expires_at, refresh_token_issued_at, status, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000213',
        $1,
        $2,
        $3,
        'Bearer',
        now() - interval '5 minutes',
        now(),
        'active',
        now(),
        now()
      )`,
      [oauthAccountId, encrypt("expired-access-token", key), encrypt("refresh-token", key)]
    )

    await database.query(
      `insert into google_oauth_connections (
        id, organization_id, workspace_id, project_id, encrypted_access_token, encrypted_refresh_token,
        token_expires_at, status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        '00000000-0000-4000-8000-000000000212',
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000203',
        '00000000-0000-4000-8000-000000000204',
        $1,
        $2,
        now() - interval '5 minutes',
        'connected',
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000201',
        now(),
        now()
      )`,
      [encrypt("expired-access-token", key), encrypt("refresh-token", key)]
    )

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "refreshed-access-token",
          refresh_token: "refreshed-refresh-token",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )

    const provider = new GoogleAdsAuthProvider(
      database,
      {
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        encryptionKey: key,
      },
      new StaticGoogleIdentityCredentialsProvider({
        clientId: "client-id",
        clientSecret: "client-secret",
        developerToken: "developer-token",
        redirectUri: "http://localhost:4000/v1/integrations/google/oauth/callback",
      })
    )

    const token = await provider.getAccessToken("00000000-0000-4000-8000-000000000212")
    expect(token).toBe("refreshed-access-token")

    const activeTokenRows = await database.query<{ count: string }>(
      "select count(*)::text as count from oauth_tokens where oauth_account_id = $1 and status = 'active'",
      [oauthAccountId]
    )
    expect(Number(activeTokenRows.rows[0]?.count ?? "0")).toBe(1)

    const refreshHistoryRows = await database.query<{ count: string }>(
      "select count(*)::text as count from token_refresh_history where oauth_account_id = $1 and integration_connection_id = $2 and status = 'success'",
      [oauthAccountId, "00000000-0000-4000-8000-000000000212"]
    )
    expect(Number(refreshHistoryRows.rows[0]?.count ?? "0")).toBe(1)
  })
})
