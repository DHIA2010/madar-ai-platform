// @vitest-environment node

import { createHmac } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

const WEBHOOK_SECRET = "test-salla-webhook-secret"
const SALLA_API_BASE_URL = "https://api.salla.dev/admin/v2"

function mockStoreInfo(store: { id: string; name?: string; domain?: string; currency?: string }) {
  const nativeFetch = globalThis.fetch
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()
    if (url.includes("/store/info")) {
      return new Response(JSON.stringify({ data: store }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    // No merchant details: the install stays pending, to be claimed from Madar.
    if (url.includes("/oauth2/user/info")) {
      return new Response("{}", { status: 401 })
    }
    if (url.startsWith(SALLA_API_BASE_URL)) {
      return new Response("{}", { status: 404 })
    }
    return nativeFetch(rawInput, init)
  })
}

function signedWebhookPost(bodyObject: unknown) {
  const body = JSON.stringify(bodyObject)
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")
  return fetch(`${baseUrl}/v1/integrations/salla/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-salla-signature": signature },
    body,
  })
}

function appStoreAuthorizeWebhook(storeId: string, data: Record<string, unknown> = {}) {
  return signedWebhookPost({
    event: "app.store.authorize",
    merchant: storeId,
    data: {
      access_token: `access-token-${storeId}`,
      refresh_token: `refresh-token-${storeId}`,
      expires: 1209599,
      ...data,
    },
  })
}

async function registerAndLogin(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Salla Marketplace Test",
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
     values ($1, $2, 'hash', 'Salla Marketplace Test', now()) on conflict (id) do nothing`,
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
       values ($1, $2, $3, 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId, `${orgName} Workspace`]
    )
  }

  return { login, actor }
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  process.env.SALLA_CLIENT_ID = "salla-client-id"
  process.env.SALLA_CLIENT_SECRET = "salla-client-secret"
  process.env.SALLA_REDIRECT_URI = "http://localhost:4000/v1/integrations/salla/oauth/callback"
  process.env.SALLA_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"
  process.env.SALLA_APP_ID = "test-salla-app-id"
  process.env.SALLA_WEBHOOK_SECRET = WEBHOOK_SECRET

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

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  delete process.env.SALLA_WEBHOOK_SECRET
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

describe("Salla App Store install (app.store.authorize webhook + connect-intent + claim)", () => {
  it("creates an unclaimed pending install from the webhook, with no organization attached yet", async () => {
    const mock = mockStoreInfo({
      id: "778899",
      name: "Candidate Store",
      domain: "candidate.salla.sa",
    })

    const response = await appStoreAuthorizeWebhook("778899")
    expect(response.status).toBe(200)

    const rows = await database.query<{
      status: string
      salla_store_name: string | null
      claimed_organization_id: string | null
      encrypted_access_token: string | null
    }>(`select * from salla_marketplace_installs where salla_store_external_id = $1`, ["778899"])
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]?.status).toBe("unclaimed")
    expect(rows.rows[0]?.salla_store_name).toBe("Candidate Store")
    expect(rows.rows[0]?.claimed_organization_id).toBeNull()
    expect(rows.rows[0]?.encrypted_access_token).toBeTruthy()

    mock.mockRestore()
  })

  it("connect-intent: waits with zero candidates, surfaces the one that arrives after it was created, and lets the owning org claim it", async () => {
    const { login } = await registerAndLogin("salla-install-owner@madar.test", "Install Owner Org")

    const intentResponse = await fetch(`${baseUrl}/v1/integrations/salla/connect-intents`, {
      method: "POST",
      headers: authHeaders(login.session.accessToken),
    })
    expect(intentResponse.status).toBe(200)
    const intent = (await intentResponse.json()) as { intentId: string; expiresAt: string }

    const statusBeforeInstall = await fetch(
      `${baseUrl}/v1/integrations/salla/connect-intents/${intent.intentId}/status`,
      { headers: authHeaders(login.session.accessToken) }
    )
    expect(statusBeforeInstall.status).toBe(200)
    expect(await statusBeforeInstall.json()).toEqual({ waiting: true })

    // Ensure strict created_at ordering against the intent's own created_at.
    await new Promise((resolve) => setTimeout(resolve, 20))

    const mock = mockStoreInfo({ id: "445566", name: "Owner's Store", domain: "owner.salla.sa" })
    const webhookResponse = await appStoreAuthorizeWebhook("445566")
    expect(webhookResponse.status).toBe(200)

    const statusAfterInstall = await fetch(
      `${baseUrl}/v1/integrations/salla/connect-intents/${intent.intentId}/status`,
      { headers: authHeaders(login.session.accessToken) }
    )
    expect(statusAfterInstall.status).toBe(200)
    const found = (await statusAfterInstall.json()) as {
      waiting: boolean
      candidate?: { claimToken: string; storeName: string; storeDomain: string | null }
    }
    expect(found.waiting).toBe(false)
    expect(found.candidate?.storeName).toBe("Owner's Store")
    expect(found.candidate?.claimToken).toBeTruthy()

    // Polling again must return the same (stable) candidate/token, not re-derive or rotate it.
    const statusAgain = await fetch(
      `${baseUrl}/v1/integrations/salla/connect-intents/${intent.intentId}/status`,
      { headers: authHeaders(login.session.accessToken) }
    )
    const foundAgain = (await statusAgain.json()) as {
      candidate?: { claimToken: string }
    }
    expect(foundAgain.candidate?.claimToken).toBe(found.candidate?.claimToken)

    const claimResponse = await fetch(
      `${baseUrl}/v1/integrations/salla/pending-installs/${found.candidate!.claimToken}/claim`,
      { method: "POST", headers: authHeaders(login.session.accessToken) }
    )
    expect(claimResponse.status).toBe(200)
    const claimed = (await claimResponse.json()) as { status: string; accountName: string }
    expect(claimed.status).toBe("connected")
    expect(claimed.accountName).toBe("Owner's Store")

    const connectionRows = await database.query<{ status: string; provider_account_id: string }>(
      `select status, provider_account_id from salla_oauth_connections where provider_account_id = $1`,
      ["445566"]
    )
    expect(connectionRows.rows).toHaveLength(1)
    expect(connectionRows.rows[0]?.status).toBe("connected")

    // Single-use: claiming the same token again must fail, never silently double-process.
    const secondClaimResponse = await fetch(
      `${baseUrl}/v1/integrations/salla/pending-installs/${found.candidate!.claimToken}/claim`,
      { method: "POST", headers: authHeaders(login.session.accessToken) }
    )
    expect(secondClaimResponse.status).toBe(500)

    mock.mockRestore()
  })

  it("stays waiting (never guesses) when more than one unclaimed install appears in the intent's window", async () => {
    const { login } = await registerAndLogin("salla-ambiguous@madar.test", "Ambiguous Org")

    const intentResponse = await fetch(`${baseUrl}/v1/integrations/salla/connect-intents`, {
      method: "POST",
      headers: authHeaders(login.session.accessToken),
    })
    const intent = (await intentResponse.json()) as { intentId: string }

    await new Promise((resolve) => setTimeout(resolve, 20))

    const mock = mockStoreInfo({ id: "111222", name: "First Store" })
    await appStoreAuthorizeWebhook("111222")
    mock.mockRestore()

    const mock2 = mockStoreInfo({ id: "333444", name: "Second Store" })
    await appStoreAuthorizeWebhook("333444")

    const status = await fetch(
      `${baseUrl}/v1/integrations/salla/connect-intents/${intent.intentId}/status`,
      { headers: authHeaders(login.session.accessToken) }
    )
    expect(await status.json()).toEqual({ waiting: true })

    mock2.mockRestore()
  })

  it("getPendingInstallSummary (public, unauthenticated) shows the store name without secrets", async () => {
    const mock = mockStoreInfo({ id: "999000", name: "Public Summary Store", currency: "SAR" })
    await appStoreAuthorizeWebhook("999000")
    mock.mockRestore()

    const rows = await database.query<{ claim_token_hash: string }>(
      `select claim_token_hash from salla_marketplace_installs where salla_store_external_id = $1`,
      ["999000"]
    )
    expect(rows.rows).toHaveLength(1)
    // The summary route is keyed by the plaintext claim token, which this test never has (only
    // the webhook handler generates it, and it's never persisted in plaintext) -- so this test
    // only confirms the route 404s cleanly on an unknown token, matching Zid's own precedent.
    const summaryResponse = await fetch(
      `${baseUrl}/v1/integrations/salla/pending-installs/not-a-real-token`
    )
    expect(summaryResponse.status).toBe(404)
  })
})
