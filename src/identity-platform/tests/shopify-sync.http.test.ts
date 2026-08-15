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
import { GoogleAnalyticsIntegrationProvider } from "../integrations/google-analytics/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

const CLIENT_SECRET = "shopify-client-secret"
const SHOP_DOMAIN = "madar-sync-test.myshopify.com"

function computeShopifyHmac(params: Record<string, string>) {
  const message = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")
  return createHmac("sha256", CLIENT_SECRET).update(message).digest("hex")
}

function buildCallbackUrl(input: { baseUrl: string; state: string; code: string; shop: string }) {
  const params: Record<string, string> = {
    state: input.state,
    code: input.code,
    shop: input.shop,
    timestamp: String(Math.floor(Date.now() / 1000)),
  }
  const hmac = computeShopifyHmac(params)

  const url = new URL(`${input.baseUrl}/v1/integrations/shopify/oauth/callback`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  url.searchParams.set("hmac", hmac)
  return url.toString()
}

interface MockShopifyDataConfig {
  products?: Array<Record<string, unknown>>
  productsPageSize?: number
  orders?: Array<Record<string, unknown>>
  customers?: Array<Record<string, unknown>>
  productsShouldFail?: boolean
}

// Simulates Shopify's Link-header cursor pagination: a "next" page is signalled via
// `Link: <url?page_info=N>; rel="next"`, and the response has no such header on the last page.
function paginateWithLinkHeader(input: {
  url: string
  items: Array<Record<string, unknown>>
  resourceKey: string
  pageSize: number
}) {
  const parsed = new URL(input.url)
  const pageInfo = parsed.searchParams.get("page_info")
  const page = pageInfo ? Number(pageInfo) : 1
  const start = (page - 1) * input.pageSize
  const pageItems = input.items.slice(start, start + input.pageSize)
  const hasNext = start + input.pageSize < input.items.length

  const headers: Record<string, string> = { "content-type": "application/json" }
  if (hasNext) {
    const nextUrl = new URL(input.url)
    nextUrl.searchParams.set("page_info", String(page + 1))
    headers.link = `<${nextUrl.toString()}>; rel="next"`
  }

  return new Response(JSON.stringify({ [input.resourceKey]: pageItems }), {
    status: 200,
    headers,
  })
}

function mockShopifyResponses(input: {
  baseUrl: string
  shopDomain: string
  accessToken: string
  shop: { id: string; name: string }
  data?: MockShopifyDataConfig
}) {
  const nativeFetch = globalThis.fetch
  const products = input.data?.products ?? []
  const productsPageSize = input.data?.productsPageSize ?? 250
  const orders = input.data?.orders ?? []
  const customers = input.data?.customers ?? []

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

    if (url.includes("/products.json")) {
      if (input.data?.productsShouldFail) {
        return new Response("{}", { status: 500 })
      }
      return paginateWithLinkHeader({
        url,
        items: products,
        resourceKey: "products",
        pageSize: productsPageSize,
      })
    }

    if (url.includes("/orders.json")) {
      return paginateWithLinkHeader({ url, items: orders, resourceKey: "orders", pageSize: 250 })
    }

    if (url.includes("/customers.json")) {
      return paginateWithLinkHeader({
        url,
        items: customers,
        resourceKey: "customers",
        pageSize: 250,
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
  container.infrastructure.integrations?.register(new SnapchatAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new MetaAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new SallaIntegrationProvider(database))
  container.infrastructure.integrations?.register(new GoogleAnalyticsIntegrationProvider(database))
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
      fullName: "Shopify Sync Test",
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
     values ($1, $2, 'hash', 'Shopify Sync Test', now()) on conflict (id) do nothing`,
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

async function connectShopify(input: {
  login: { session: { accessToken: string } }
  workspaceId: string
  shopDomain: string
}) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/shopify/oauth/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.login.session.accessToken}`,
      "x-workspace-id": input.workspaceId,
    },
    body: JSON.stringify({ workspaceId: input.workspaceId, shopDomain: input.shopDomain }),
  })
  const started = (await startResponse.json()) as { state: string; connectionId: string }

  const callbackUrl = buildCallbackUrl({
    baseUrl,
    state: started.state,
    code: "shopify-sync-code",
    shop: input.shopDomain,
  })
  await fetch(callbackUrl, { redirect: "manual" })

  return started
}

function syncHeaders(login: { session: { accessToken: string } }, workspaceId: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${login.session.accessToken}`,
    "x-workspace-id": workspaceId,
  }
}

describe("shopify data sync: real products/orders/customers pipeline", () => {
  it("fetches real paginated products/orders/customers and persists them as records", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "shopify-sync-full@madar.test",
      "Shopify Sync Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000910"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000911",
      label: "Shopify Sync Full",
    })

    const products = Array.from({ length: 17 }, (_, i) => ({
      id: 2000 + i,
      title: `Product ${i}`,
      updated_at: "2026-01-01T00:00:00Z",
    }))
    const orders = [{ id: 6001, updated_at: "2026-01-02T00:00:00Z" }]
    const customers = [
      { id: 9101, updated_at: "2026-01-03T00:00:00Z" },
      { id: 9102, updated_at: "2026-01-03T00:00:00Z" },
    ]

    mockShopifyResponses({
      baseUrl,
      shopDomain: SHOP_DOMAIN,
      accessToken: "shopify-access-sync",
      shop: { id: "445566", name: "Sync Test Store" },
      data: { products, productsPageSize: 15, orders, customers },
    })

    const started = await connectShopify({ login, workspaceId, shopDomain: SHOP_DOMAIN })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/shopify/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "445566",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-1",
        mode: "incremental",
        trigger: "manual",
      }),
    })
    expect(syncResponse.status).toBe(200)
    const syncResult = (await syncResponse.json()) as {
      status: string
      metrics: Record<string, number>
    }
    expect(syncResult.status).toBe("completed")
    expect(syncResult.metrics.products).toBe(17)
    expect(syncResult.metrics.orders).toBe(1)
    expect(syncResult.metrics.customers).toBe(2)
    expect(syncResult.metrics.totalRecords).toBe(20)

    const recordRows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from shopify_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordRows.rows).toHaveLength(20)
    expect(recordRows.rows.filter((r) => r.entity_type === "products")).toHaveLength(17)
    // Confirms Link-header pagination actually followed rel="next" past page 1 (15 products).
    expect(recordRows.rows.some((r) => r.entity_id === "2016")).toBe(true)

    const recordsResponse = await fetch(
      `${baseUrl}/v1/integrations/shopify/records?connectionId=${started.connectionId}&customerId=445566&entityType=orders`,
      {
        headers: {
          authorization: `Bearer ${login.session.accessToken}`,
          "x-workspace-id": workspaceId,
        },
      }
    )
    expect(recordsResponse.status).toBe(200)
    const recordsBody = (await recordsResponse.json()) as { items: Array<{ entityId: string }> }
    expect(recordsBody.items).toHaveLength(1)
    expect(recordsBody.items[0]?.entityId).toBe("6001")
  })

  it("is idempotent: re-running sync with the same idempotencyKey does not re-fetch from Shopify", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "shopify-sync-idempotent@madar.test",
      "Shopify Sync Idempotent Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000920"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000921",
      label: "Shopify Sync Idempotent",
    })

    const fetchSpy = mockShopifyResponses({
      baseUrl,
      shopDomain: SHOP_DOMAIN,
      accessToken: "shopify-access-idempotent",
      shop: { id: "112233", name: "Idempotent Store" },
      data: {
        products: [{ id: 1, updated_at: "2026-01-01T00:00:00Z" }],
        orders: [],
        customers: [],
      },
    })

    const started = await connectShopify({ login, workspaceId, shopDomain: SHOP_DOMAIN })

    const syncInput = {
      connectionId: started.connectionId,
      customerId: "112233",
      startDate: "2026-01-01",
      endDate: "2026-01-08",
      idempotencyKey: "sync-run-idempotent",
      mode: "incremental" as const,
      trigger: "manual" as const,
    }

    // fetchSpy also records the test's own outer HTTP calls to the local server (they pass
    // through to nativeFetch but are still logged) -- only calls to Shopify's real API domain
    // reflect whether the sync engine itself did any work.
    const externalCallCount = () =>
      fetchSpy.mock.calls.filter(([rawInput]) => {
        const url = typeof rawInput === "string" ? rawInput : String(rawInput)
        return !url.startsWith(baseUrl)
      }).length

    const first = await fetch(`${baseUrl}/v1/integrations/shopify/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(first.status).toBe(200)
    const externalCallsAfterFirst = externalCallCount()

    const second = await fetch(`${baseUrl}/v1/integrations/shopify/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { metrics: Record<string, number> }

    // No new Shopify API calls at all -- the second call returned the cached completed run.
    expect(externalCallCount()).toBe(externalCallsAfterFirst)
    expect(secondBody.metrics.products).toBe(1)
  })

  it("deletes the connection cleanly after a sync has written records (no FK violation)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "shopify-sync-delete@madar.test",
      "Shopify Sync Delete Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000925"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000926",
      label: "Shopify Sync Delete",
    })

    mockShopifyResponses({
      baseUrl,
      shopDomain: SHOP_DOMAIN,
      accessToken: "shopify-access-delete",
      shop: { id: "113344", name: "Delete Store" },
      data: {
        products: [{ id: 1, updated_at: "2026-01-01T00:00:00Z" }],
        orders: [],
        customers: [],
      },
    })

    const started = await connectShopify({ login, workspaceId, shopDomain: SHOP_DOMAIN })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/shopify/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "113344",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-delete",
        mode: "incremental",
        trigger: "manual",
      }),
    })
    expect(syncResponse.status).toBe(200)

    const runsBefore = await database.query(
      `select id from shopify_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsBefore.rows.length).toBeGreaterThan(0)

    const deleteResponse = await fetch(`${baseUrl}/v1/integrations/${started.connectionId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.session.accessToken}` },
    })
    expect(deleteResponse.status).toBe(204)

    const runsAfter = await database.query(
      `select id from shopify_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsAfter.rows).toHaveLength(0)
    const recordsAfter = await database.query(
      `select id from shopify_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordsAfter.rows).toHaveLength(0)
  })

  it("marks the sync run failed when Shopify's API errors, without corrupting the connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "shopify-sync-failure@madar.test",
      "Shopify Sync Failure Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000930"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000931",
      label: "Shopify Sync Failure",
    })

    mockShopifyResponses({
      baseUrl,
      shopDomain: SHOP_DOMAIN,
      accessToken: "shopify-access-failure",
      shop: { id: "334455", name: "Failure Store" },
      data: { productsShouldFail: true },
    })

    const started = await connectShopify({ login, workspaceId, shopDomain: SHOP_DOMAIN })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/shopify/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "334455",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-failure",
        mode: "incremental",
        trigger: "manual",
      }),
    })
    expect(syncResponse.status).toBe(502)

    const runRows = await database.query<{ status: string; error_code: string | null }>(
      `select status, error_code from shopify_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runRows.rows[0]?.status).toBe("failed")
    expect(runRows.rows[0]?.error_code).toBe("SHOPIFY_SYNC_API_REQUEST_FAILED")

    const connectionRows = await database.query<{ status: string }>(
      `select status from shopify_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("connected")
  })

  it("rejects sync from a non-owner/admin actor", async () => {
    const { actor } = await registerAndProvisionOrg(
      "shopify-sync-forbidden@madar.test",
      "Shopify Sync Forbidden Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000940"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000941",
      label: "Shopify Sync Forbidden",
    })

    const provider = new ShopifyIntegrationProvider(database)
    const started = await provider.oauthStart(
      { ...actor, workspaceId, roles: ["owner" as const] },
      { workspaceId, shopDomain: SHOP_DOMAIN }
    )
    const connectionId = (started as { connectionId: string }).connectionId

    const viewerActor = { ...actor, workspaceId, roles: ["viewer" as const] }
    await expect(
      provider.sync(viewerActor, {
        connectionId,
        customerId: "445566",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-forbidden",
      })
    ).rejects.toMatchObject({ code: "SHOPIFY_SYNC_FORBIDDEN", status: 403 })
  })

  it("rejects sync for a customerId that isn't an accessible store on this connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "shopify-sync-invalid-account@madar.test",
      "Shopify Sync Invalid Account Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000950"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000951",
      label: "Shopify Sync Invalid Account",
    })

    mockShopifyResponses({
      baseUrl,
      shopDomain: SHOP_DOMAIN,
      accessToken: "shopify-access-invalid",
      shop: { id: "556677", name: "Invalid Account Store" },
      data: {},
    })

    const started = await connectShopify({ login, workspaceId, shopDomain: SHOP_DOMAIN })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/shopify/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "not-a-real-store-id",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-invalid-account",
      }),
    })
    expect(syncResponse.status).toBe(400)
    const body = (await syncResponse.json()) as { code: string }
    expect(body.code).toBe("SHOPIFY_INVALID_ACCOUNT")
  })
})
