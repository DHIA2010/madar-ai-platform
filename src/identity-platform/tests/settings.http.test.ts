// @vitest-environment node
//
// Covers the new Settings-page backend: change password (POST /v1/identity/profile/password),
// org logo upload (POST /v1/organizations/:id/logo), the connected-platforms count
// (GET /v1/organizations/:id/connected-platforms), and the widened updateOrganization field set
// (currency/settings) the rebuilt Settings page now sends.

import { randomUUID } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>
let uploadedObjects: Array<{ key: string; contentType: string }>

const PASSWORD = "VeryStrongPassword123!"

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

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

  uploadedObjects = []
  ;(
    container.infrastructure as {
      objectStorage?: { uploadPublicObject: (input: unknown) => Promise<string> }
    }
  ).objectStorage = {
    async uploadPublicObject(input: unknown) {
      const typed = input as { key: string; contentType: string }
      uploadedObjects.push({ key: typed.key, contentType: typed.contentType })
      return `https://cdn.test.local/org-logos-bucket/${typed.key}`
    },
  }

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
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
      password: PASSWORD,
      fullName: "Settings Test Owner",
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
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  // The command layer doesn't synchronously write these rows in "memory" mode -- backfill them
  // directly so foreign keys from provider *_oauth_connections tables (seeded below in some
  // tests) resolve, same pattern already established in tracking-sdk.http.test.ts.
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'Settings Test Owner', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, 'Default Workspace', 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId]
    )
  }

  return { accessToken: login.session.accessToken, organizationId: actor.organizationId, actor }
}

function authHeaders(accessToken: string) {
  return { "content-type": "application/json", authorization: `Bearer ${accessToken}` }
}

describe("POST /v1/identity/profile/password", () => {
  it("rejects the wrong current password with 401", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@password-wrong.madar",
      "Password Wrong Org"
    )

    const response = await fetch(`${baseUrl}/v1/identity/profile/password`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        currentPassword: "definitely-not-it",
        newPassword: "AnotherStrongPassword456!",
      }),
    })
    expect(response.status).toBe(401)
  })

  it("changes the password with the correct current password, and the new password logs in", async () => {
    const email = "owner@password-change.madar"
    const { accessToken } = await registerAndProvisionOrg(email, "Password Change Org")

    const response = await fetch(`${baseUrl}/v1/identity/profile/password`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: "AnotherStrongPassword456!" }),
    })
    expect(response.status).toBe(200)

    const loginWithNewPassword = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "AnotherStrongPassword456!" }),
    })
    expect(loginWithNewPassword.status).toBe(200)

    const loginWithOldPassword = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    expect(loginWithOldPassword.status).toBe(401)
  })

  it("rejects a new password shorter than 12 characters", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@password-short.madar",
      "Password Short Org"
    )

    const response = await fetch(`${baseUrl}/v1/identity/profile/password`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: "short1!" }),
    })
    expect(response.status).toBe(400)
  })
})

describe("POST /v1/organizations/:id/logo", () => {
  it("uploads a logo and persists logoUrl on the organization", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@logo-upload.madar",
      "Logo Upload Org"
    )

    const response = await fetch(`${baseUrl}/v1/organizations/${organizationId}/logo`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        contentType: "image/png",
        dataBase64: Buffer.from("fake-png-bytes").toString("base64"),
      }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { logoUrl: string }
    expect(body.logoUrl).toBe(`https://cdn.test.local/org-logos-bucket/${uploadedObjects[0].key}`)
    expect(uploadedObjects[0].key).toMatch(new RegExp(`^org-logos/${organizationId}/.+\\.png$`))

    const getResponse = await fetch(`${baseUrl}/v1/organizations/${organizationId}`, {
      headers: authHeaders(accessToken),
    })
    const org = (await getResponse.json()) as { logoUrl: string | null }
    expect(org.logoUrl).toBe(body.logoUrl)
  })

  it("rejects an oversized upload", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@logo-oversized.madar",
      "Logo Oversized Org"
    )

    const response = await fetch(`${baseUrl}/v1/organizations/${organizationId}/logo`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        contentType: "image/png",
        dataBase64: Buffer.alloc(4 * 1024 * 1024, 1).toString("base64"),
      }),
    })
    expect(response.status).toBe(400)
  })
})

describe("GET /v1/organizations/:id/connected-platforms", () => {
  it("counts real connected providers across multiple provider tables", async () => {
    const { accessToken, organizationId, actor } = await registerAndProvisionOrg(
      "owner@connected-count.madar",
      "Connected Count Org"
    )
    const workspaceId = actor.workspaceId as string

    await database.query(
      `insert into meta_oauth_connections (id, organization_id, workspace_id, project_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at)
       values ($1, $2, $3, $4, 'connected', $5, $5, now(), now())`,
      [randomUUID(), organizationId, workspaceId, randomUUID(), actor.userId]
    )
    await database.query(
      `insert into salla_oauth_connections (id, organization_id, workspace_id, project_id, status, created_by_user_id, updated_by_user_id, created_at, updated_at)
       values ($1, $2, $3, $4, 'connected', $5, $5, now(), now())`,
      [randomUUID(), organizationId, workspaceId, randomUUID(), actor.userId]
    )
    // A disconnected provider must not count.
    await database.query(
      `insert into shopify_oauth_connections (id, organization_id, workspace_id, project_id, status, shop_domain, created_by_user_id, updated_by_user_id, created_at, updated_at)
       values ($1, $2, $3, $4, 'disconnected', $5, $6, $6, now(), now())`,
      [
        randomUUID(),
        organizationId,
        workspaceId,
        randomUUID(),
        "unused.myshopify.com",
        actor.userId,
      ]
    )

    const response = await fetch(
      `${baseUrl}/v1/organizations/${organizationId}/connected-platforms`,
      {
        headers: authHeaders(accessToken),
      }
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { connected: number; total: number; userCount: number }
    expect(body.connected).toBe(2)
    expect(body.total).toBe(8)
    expect(body.userCount).toBe(1)
  })

  it("returns 403 for an organization the actor doesn't belong to", async () => {
    const { accessToken } = await registerAndProvisionOrg(
      "owner@connected-forbidden.madar",
      "Forbidden Org"
    )
    const other = await registerAndProvisionOrg("owner@connected-other.madar", "Other Org")

    const response = await fetch(
      `${baseUrl}/v1/organizations/${other.organizationId}/connected-platforms`,
      { headers: authHeaders(accessToken) }
    )
    expect(response.status).toBe(403)
  })
})

describe("PATCH /v1/organizations/:id: widened Settings-page field set", () => {
  it("persists currency and settings (storeName/country) together", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@org-update-fields.madar",
      "Org Update Fields Org"
    )

    const response = await fetch(`${baseUrl}/v1/organizations/${organizationId}`, {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        currency: "SAR",
        settings: { storeName: "Madar Store", country: "SA" },
      }),
    })
    expect(response.status).toBe(200)

    const getResponse = await fetch(`${baseUrl}/v1/organizations/${organizationId}`, {
      headers: authHeaders(accessToken),
    })
    const org = (await getResponse.json()) as {
      currency: string
      settings: Record<string, unknown>
    }
    expect(org.currency).toBe("SAR")
    expect(org.settings).toMatchObject({ storeName: "Madar Store", country: "SA" })
  })

  it("merges settings across separate calls instead of replacing the whole object", async () => {
    const { accessToken, organizationId } = await registerAndProvisionOrg(
      "owner@org-update-merge.madar",
      "Org Update Merge Org"
    )

    await fetch(`${baseUrl}/v1/organizations/${organizationId}`, {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ settings: { storeName: "Madar Store" } }),
    })
    // A later call that only touches "country" must not wipe out "storeName" -- the two fields
    // are saved independently by the Settings page's inline-edit-per-field UI.
    await fetch(`${baseUrl}/v1/organizations/${organizationId}`, {
      method: "PATCH",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ settings: { country: "SA" } }),
    })

    const getResponse = await fetch(`${baseUrl}/v1/organizations/${organizationId}`, {
      headers: authHeaders(accessToken),
    })
    const org = (await getResponse.json()) as { settings: Record<string, unknown> }
    expect(org.settings).toMatchObject({ storeName: "Madar Store", country: "SA" })
  })
})
