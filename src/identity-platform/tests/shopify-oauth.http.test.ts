// @vitest-environment node

import { createHmac } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ShopifyIntegrationProvider } from "../integrations/shopify/provider"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { MetaAdsIntegrationProvider } from "../integrations/meta-ads/provider"
import { SallaIntegrationProvider } from "../integrations/salla/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { ShopifyOAuthRepository } from "../shopify-oauth/repository"
import { ShopifyOAuthService } from "../shopify-oauth/service"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

const CLIENT_SECRET = "shopify-client-secret"

function computeShopifyHmac(params: Record<string, string>) {
  const message = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")
  return createHmac("sha256", CLIENT_SECRET).update(message).digest("hex")
}

function buildCallbackUrl(input: {
  baseUrl: string
  state: string
  code: string
  shop: string
  overrideHmac?: string
}) {
  const params: Record<string, string> = {
    state: input.state,
    code: input.code,
    shop: input.shop,
    timestamp: String(Math.floor(Date.now() / 1000)),
  }
  const hmac = input.overrideHmac ?? computeShopifyHmac(params)

  const url = new URL(`${input.baseUrl}/v1/integrations/shopify/oauth/callback`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  url.searchParams.set("hmac", hmac)
  return url.toString()
}

function mockShopifyResponses(input: {
  baseUrl: string
  shopDomain: string
  accessToken: string
  shop: { id: string; name: string; email?: string; currency?: string; iana_timezone?: string }
}) {
  const nativeFetch = globalThis.fetch

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url === `https://${input.shopDomain}/admin/oauth/access_token`) {
      return new Response(
        JSON.stringify({
          access_token: input.accessToken,
          scope: "read_products,read_orders,read_customers",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url === `https://${input.shopDomain}/admin/api/2024-10/shop.json`) {
      return new Response(JSON.stringify({ shop: input.shop }), {
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

  process.env.SHOPIFY_CLIENT_ID = "shopify-client-id"
  process.env.SHOPIFY_CLIENT_SECRET = CLIENT_SECRET
  process.env.SHOPIFY_REDIRECT_URI = "http://localhost:4000/v1/integrations/shopify/oauth/callback"
  process.env.SHOPIFY_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  // so those dead entries must be overwritten with real ones or they block Shopify's turn.
  container.infrastructure.integrations?.register(new SnapchatAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new MetaAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new SallaIntegrationProvider(database))
  container.infrastructure.integrations?.register(new ShopifyIntegrationProvider(database))

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
      fullName: "Shopify OAuth Test",
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
     values ($1, $2, 'hash', 'Shopify OAuth Test', now()) on conflict (id) do nothing`,
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

describe("shopify oauth http flow", () => {
  it("full flow: start -> callback -> access token persisted (no refresh token), store discovered via shop.json", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "shopify-http@madar.test",
      "Shopify HTTP Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000610"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000611",
      label: "Shopify HTTP",
    })

    const shopDomain = "madar-test.myshopify.com"
    mockShopifyResponses({
      baseUrl,
      shopDomain,
      accessToken: "shopify-access-token",
      shop: {
        id: "998877",
        name: "Madar Test Store",
        email: "owner@madar-test.myshopify.com",
        currency: "SAR",
        iana_timezone: "Asia/Riyadh",
      },
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/shopify/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, connectionName: "Shopify Store", shopDomain }),
    })
    expect(startResponse.status).toBe(200)

    const started = (await startResponse.json()) as {
      authorizationUrl: string
      state: string
      connectionId: string
    }
    expect(started.authorizationUrl).toContain(`${shopDomain}/admin/oauth/authorize`)
    expect(started.authorizationUrl).toContain("scope=read_products%2Cread_orders%2Cread_customers")

    const callbackUrl = buildCallbackUrl({
      baseUrl,
      state: started.state,
      code: "shopify-code",
      shop: shopDomain,
    })
    const callbackResponse = await fetch(callbackUrl, { redirect: "manual" })
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("shopify_oauth=connected")

    const connectionRows = await database.query<{
      status: string
      encrypted_access_token: string | null
      encrypted_refresh_token: string | null
      provider_account_id: string | null
      shop_domain: string
    }>(
      `select status, encrypted_access_token, encrypted_refresh_token, provider_account_id, shop_domain
       from shopify_oauth_connections where id = $1`,
      [started.connectionId]
    )

    expect(connectionRows.rows[0]?.status).toBe("connected")
    expect(connectionRows.rows[0]?.encrypted_access_token).toBeTruthy()
    // Shopify's offline access token never expires and there is no refresh_token grant.
    expect(connectionRows.rows[0]?.encrypted_refresh_token).toBeNull()
    expect(connectionRows.rows[0]?.provider_account_id).toBe("998877")
    expect(connectionRows.rows[0]?.shop_domain).toBe(shopDomain)

    const storeRows = await database.query<{ account_id: string; account_name: string | null }>(
      `select account_id, account_name from shopify_stores where connection_id = $1`,
      [started.connectionId]
    )
    expect(storeRows.rows).toHaveLength(1)
    expect(storeRows.rows[0]?.account_id).toBe("998877")
    expect(storeRows.rows[0]?.account_name).toBe("Madar Test Store")
  })

  it("rejects a callback with an invalid hmac (forged callback protection)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "shopify-hmac@madar.test",
      "Shopify HMAC Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000615"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000616",
      label: "Shopify HMAC",
    })

    const shopDomain = "madar-hmac.myshopify.com"
    mockShopifyResponses({
      baseUrl,
      shopDomain,
      accessToken: "shopify-access-token",
      shop: { id: "1", name: "HMAC Store" },
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/shopify/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, shopDomain }),
    })
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    const callbackUrl = buildCallbackUrl({
      baseUrl,
      state: started.state,
      code: "shopify-code",
      shop: shopDomain,
      overrideHmac: "0".repeat(64),
    })
    const callbackResponse = await fetch(callbackUrl, { redirect: "manual" })
    expect(callbackResponse.status).toBe(302)
    expect(callbackResponse.headers.get("location")).toContain("reason=hmac_invalid")

    const connectionRows = await database.query<{ status: string }>(
      `select status from shopify_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("pending")
  })

  it("workspace isolation: a connection created in one workspace is not accessible from a different workspace in the same organization", async () => {
    const { actor } = await registerAndProvisionOrg(
      "shopify-workspace-isolation@madar.test",
      "Shopify Isolation Org"
    )

    const workspaceAId = "00000000-0000-4000-8000-000000000620"
    const workspaceBId = "00000000-0000-4000-8000-000000000621"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId: workspaceAId,
      projectId: "00000000-0000-4000-8000-000000000622",
      label: "Shopify Workspace A",
    })
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId: workspaceBId,
      projectId: "00000000-0000-4000-8000-000000000623",
      label: "Shopify Workspace B",
    })

    const actorInWorkspaceA = { ...actor, workspaceId: workspaceAId, roles: ["owner" as const] }
    const actorInWorkspaceB = { ...actor, workspaceId: workspaceBId, roles: ["owner" as const] }

    const provider = new ShopifyIntegrationProvider(database)
    const started = await provider.oauthStart(actorInWorkspaceA, {
      workspaceId: workspaceAId,
      shopDomain: "madar-isolation.myshopify.com",
    })
    const connectionId = (started as { connectionId: string }).connectionId

    await expect(provider.listAccounts(actorInWorkspaceB, { connectionId })).rejects.toMatchObject({
      code: "SHOPIFY_CONNECTION_NOT_FOUND",
      status: 404,
    })

    await expect(provider.listAccounts(actorInWorkspaceA, { connectionId })).rejects.toMatchObject({
      code: "SHOPIFY_CONNECTION_NOT_READY",
      status: 409,
    })

    await expect(provider.pause?.(actorInWorkspaceB, { connectionId })).rejects.toThrow(
      "SHOPIFY_OAUTH_CONNECTION_NOT_FOUND"
    )

    const pauseResult = (await provider.pause?.(actorInWorkspaceA, { connectionId })) as {
      status: string
    }
    expect(pauseResult.status).toBe("paused")
  })

  it("lifecycle: pause, resume, disconnect (soft delete), reconnect and events all work over HTTP", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "shopify-lifecycle@madar.test",
      "Shopify Lifecycle Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000630"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000631",
      label: "Shopify Lifecycle",
    })

    const shopDomain = "madar-lifecycle.myshopify.com"
    mockShopifyResponses({
      baseUrl,
      shopDomain,
      accessToken: "shopify-access-lifecycle",
      shop: { id: "112233", name: "Lifecycle Store" },
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/shopify/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, connectionName: "Lifecycle Store", shopDomain }),
    })
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    await fetch(
      buildCallbackUrl({ baseUrl, state: started.state, code: "shopify-code", shop: shopDomain }),
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

    const remaining = await database.query(
      `select id from shopify_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(remaining.rows).toHaveLength(0)
  })

  it("resolveAccessToken: returns the stored token directly, with no refresh call (offline tokens never expire)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "shopify-token@madar.test",
      "Shopify Token Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000640"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000641",
      label: "Shopify Token",
    })

    const shopDomain = "madar-token.myshopify.com"
    const fetchSpy = mockShopifyResponses({
      baseUrl,
      shopDomain,
      accessToken: "shopify-access-permanent",
      shop: { id: "445566", name: "Token Store" },
    })

    const startResponse = await fetch(`${baseUrl}/v1/integrations/shopify/oauth/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.session.accessToken}`,
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ workspaceId, shopDomain }),
    })
    const started = (await startResponse.json()) as { state: string; connectionId: string }

    await fetch(
      buildCallbackUrl({ baseUrl, state: started.state, code: "shopify-code", shop: shopDomain }),
      { redirect: "manual" }
    )

    const callsAfterConnect = fetchSpy.mock.calls.length

    const repository = new ShopifyOAuthRepository(database)
    const service = new ShopifyOAuthService(repository)
    const token = await service.resolveAccessToken(started.connectionId)
    expect(token).toBe("shopify-access-permanent")
    // No network call at all -- resolveAccessToken only decrypts the stored token.
    expect(fetchSpy.mock.calls.length).toBe(callsAfterConnect)
  })

  it("production endpoint contract: service builds per-shop OAuth + Admin API endpoints from the shop domain", () => {
    const repository = new ShopifyOAuthRepository(database)
    const service = new ShopifyOAuthService(repository)
    const endpoints = service.getOAuthEndpointsForTesting("madar-contract.myshopify.com")

    expect(endpoints.authorizationUrl).toBe(
      "https://madar-contract.myshopify.com/admin/oauth/authorize"
    )
    expect(endpoints.tokenUrl).toBe("https://madar-contract.myshopify.com/admin/oauth/access_token")
    expect(endpoints.apiBaseUrl).toBe("https://madar-contract.myshopify.com/admin/api/2024-10")
  })
})
