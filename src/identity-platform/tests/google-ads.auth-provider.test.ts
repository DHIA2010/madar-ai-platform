// @vitest-environment node

import crypto from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { GoogleAdsAuthProvider } from "../google-ads/auth-provider"

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
      clientId: "client-id",
      clientSecret: "client-secret",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      encryptionKey: key,
    })

    const token = await provider.getAccessToken("00000000-0000-4000-8000-000000000205")
    expect(token).toBe("access-token")
  })

  it("fails when refresh token is missing", async () => {
    const key = "12345678901234567890123456789012"
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
      clientId: "client-id",
      clientSecret: "client-secret",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      encryptionKey: key,
    })

    await expect(provider.getAccessToken("00000000-0000-4000-8000-000000000206"))
      .rejects.toMatchObject({ code: "GOOGLE_ADS_TOKEN_UNAVAILABLE" })
  })
})
