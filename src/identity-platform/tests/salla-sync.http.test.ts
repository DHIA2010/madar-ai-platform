// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SallaIntegrationProvider } from "../integrations/salla/provider"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { MetaAdsIntegrationProvider } from "../integrations/meta-ads/provider"
import { ShopifyIntegrationProvider } from "../integrations/shopify/provider"
import { GoogleAnalyticsIntegrationProvider } from "../integrations/google-analytics/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

interface MockSallaDataConfig {
  products?: Array<Record<string, unknown>>
  productsPageSize?: number
  orders?: Array<Record<string, unknown>>
  customers?: Array<Record<string, unknown>>
  productsShouldFail?: boolean
}

function paginate(items: Array<Record<string, unknown>>, page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  const data = items.slice(start, start + pageSize)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  return { data, pagination: { currentPage: page, totalPages } }
}

function mockSallaResponses(input: {
  baseUrl: string
  accessToken: string
  refreshToken: string
  store: { id: string; name: string }
  data?: MockSallaDataConfig
}) {
  const nativeFetch = globalThis.fetch
  const products = input.data?.products ?? []
  const productsPageSize = input.data?.productsPageSize ?? 15
  const orders = input.data?.orders ?? []
  const customers = input.data?.customers ?? []

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/oauth2/token")) {
      const body = typeof init?.body === "string" ? init.body : ""
      const params = new URLSearchParams(body)
      const isRefresh = params.get("grant_type") === "refresh_token"
      return new Response(
        JSON.stringify({
          access_token: isRefresh ? `${input.accessToken}-refreshed` : input.accessToken,
          refresh_token: input.refreshToken,
          expires_in: 3600,
          token_type: "Bearer",
          scope: "offline_access",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/store/info")) {
      return new Response(JSON.stringify({ data: input.store }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.includes("/products")) {
      if (input.data?.productsShouldFail) {
        return new Response("{}", { status: 500 })
      }
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get("page") ?? "1")
      return new Response(JSON.stringify(paginate(products, page, productsPageSize)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.includes("/orders")) {
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get("page") ?? "1")
      return new Response(JSON.stringify(paginate(orders, page, 15)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.includes("/customers")) {
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get("page") ?? "1")
      return new Response(JSON.stringify(paginate(customers, page, 15)), {
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

  process.env.SALLA_CLIENT_ID = "salla-client-id"
  process.env.SALLA_CLIENT_SECRET = "salla-client-secret"
  process.env.SALLA_REDIRECT_URI = "http://localhost:4000/v1/integrations/salla/oauth/callback"
  process.env.SALLA_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  container.infrastructure.integrations?.register(new ShopifyIntegrationProvider(database))
  container.infrastructure.integrations?.register(new GoogleAnalyticsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new SallaIntegrationProvider(database))

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
      fullName: "Salla Sync Test",
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
     values ($1, $2, 'hash', 'Salla Sync Test', now()) on conflict (id) do nothing`,
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

async function connectSalla(input: {
  login: { session: { accessToken: string } }
  workspaceId: string
}) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/salla/oauth/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.login.session.accessToken}`,
      "x-workspace-id": input.workspaceId,
    },
    body: JSON.stringify({ workspaceId: input.workspaceId }),
  })
  const started = (await startResponse.json()) as { state: string; connectionId: string }

  await fetch(
    `${baseUrl}/v1/integrations/salla/oauth/callback?state=${encodeURIComponent(started.state)}&code=salla-code`,
    { redirect: "manual" }
  )

  return started
}

function syncHeaders(login: { session: { accessToken: string } }, workspaceId: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${login.session.accessToken}`,
    "x-workspace-id": workspaceId,
  }
}

describe("salla data sync: real products/orders/customers pipeline", () => {
  it("fetches real paginated products/orders/customers and persists them as records", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "salla-sync-full@madar.test",
      "Salla Sync Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000810"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000811",
      label: "Salla Sync Full",
    })

    const products = Array.from({ length: 17 }, (_, i) => ({
      id: 1000 + i,
      name: `Product ${i}`,
      updated_at: "2026-01-01T00:00:00Z",
    }))
    const orders = [{ id: 5001, updated_at: "2026-01-02T00:00:00Z" }]
    const customers = [
      { id: 9001, updated_at: "2026-01-03T00:00:00Z" },
      { id: 9002, updated_at: "2026-01-03T00:00:00Z" },
    ]

    mockSallaResponses({
      baseUrl,
      accessToken: "salla-access-sync",
      refreshToken: "salla-refresh-sync",
      store: { id: "778899", name: "Sync Test Store" },
      data: { products, productsPageSize: 15, orders, customers },
    })

    const started = await connectSalla({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/salla/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "778899",
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
      `select entity_type, entity_id from salla_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordRows.rows).toHaveLength(20)
    expect(recordRows.rows.filter((r) => r.entity_type === "products")).toHaveLength(17)
    // Confirms pagination actually walked past page 1 (15 products) to page 2 (2 more).
    expect(recordRows.rows.some((r) => r.entity_id === "1016")).toBe(true)

    const recordsResponse = await fetch(
      `${baseUrl}/v1/integrations/salla/records?connectionId=${started.connectionId}&customerId=778899&entityType=orders`,
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
    expect(recordsBody.items[0]?.entityId).toBe("5001")
  })

  it("is idempotent: re-running sync with the same idempotencyKey does not re-fetch from Salla", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "salla-sync-idempotent@madar.test",
      "Salla Sync Idempotent Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000820"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000821",
      label: "Salla Sync Idempotent",
    })

    const fetchSpy = mockSallaResponses({
      baseUrl,
      accessToken: "salla-access-idempotent",
      refreshToken: "salla-refresh-idempotent",
      store: { id: "1122", name: "Idempotent Store" },
      data: {
        products: [{ id: 1, updated_at: "2026-01-01T00:00:00Z" }],
        orders: [],
        customers: [],
      },
    })

    const started = await connectSalla({ login, workspaceId })

    const syncInput = {
      connectionId: started.connectionId,
      customerId: "1122",
      startDate: "2026-01-01",
      endDate: "2026-01-08",
      idempotencyKey: "sync-run-idempotent",
      mode: "incremental" as const,
      trigger: "manual" as const,
    }

    // fetchSpy also records the test's own outer HTTP calls to the local server (they pass
    // through to nativeFetch but are still logged) -- only calls to Salla's real API domain
    // reflect whether the sync engine itself did any work.
    const externalCallCount = () =>
      fetchSpy.mock.calls.filter(([rawInput]) => {
        const url = typeof rawInput === "string" ? rawInput : String(rawInput)
        return !url.startsWith(baseUrl)
      }).length

    const first = await fetch(`${baseUrl}/v1/integrations/salla/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(first.status).toBe(200)
    const externalCallsAfterFirst = externalCallCount()

    const second = await fetch(`${baseUrl}/v1/integrations/salla/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { metrics: Record<string, number> }

    // No new Salla API calls at all -- the second call returned the cached completed run.
    expect(externalCallCount()).toBe(externalCallsAfterFirst)
    expect(secondBody.metrics.products).toBe(1)
  })

  it("deletes the connection cleanly after a sync has written records (no FK violation)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "salla-sync-delete@madar.test",
      "Salla Sync Delete Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000825"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000826",
      label: "Salla Sync Delete",
    })

    mockSallaResponses({
      baseUrl,
      accessToken: "salla-access-delete",
      refreshToken: "salla-refresh-delete",
      store: { id: "1133", name: "Delete Store" },
      data: {
        products: [{ id: 1, updated_at: "2026-01-01T00:00:00Z" }],
        orders: [],
        customers: [],
      },
    })

    const started = await connectSalla({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/salla/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "1133",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-delete",
        mode: "incremental",
        trigger: "manual",
      }),
    })
    expect(syncResponse.status).toBe(200)

    const runsBefore = await database.query(
      `select id from salla_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsBefore.rows.length).toBeGreaterThan(0)

    const deleteResponse = await fetch(`${baseUrl}/v1/integrations/${started.connectionId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.session.accessToken}` },
    })
    expect(deleteResponse.status).toBe(204)

    const runsAfter = await database.query(
      `select id from salla_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsAfter.rows).toHaveLength(0)
    const recordsAfter = await database.query(
      `select id from salla_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordsAfter.rows).toHaveLength(0)
  })

  it("marks the sync run failed when Salla's API errors, without corrupting the connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "salla-sync-failure@madar.test",
      "Salla Sync Failure Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000830"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000831",
      label: "Salla Sync Failure",
    })

    mockSallaResponses({
      baseUrl,
      accessToken: "salla-access-failure",
      refreshToken: "salla-refresh-failure",
      store: { id: "3344", name: "Failure Store" },
      data: { productsShouldFail: true },
    })

    const started = await connectSalla({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/salla/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "3344",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-failure",
        mode: "incremental",
        trigger: "manual",
      }),
    })
    expect(syncResponse.status).toBe(502)

    const runRows = await database.query<{ status: string; error_code: string | null }>(
      `select status, error_code from salla_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runRows.rows[0]?.status).toBe("failed")
    expect(runRows.rows[0]?.error_code).toBe("SALLA_SYNC_API_REQUEST_FAILED")

    const connectionRows = await database.query<{ status: string }>(
      `select status from salla_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("connected")
  })

  it("rejects sync from a non-owner/admin actor", async () => {
    const { actor } = await registerAndProvisionOrg(
      "salla-sync-forbidden@madar.test",
      "Salla Sync Forbidden Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000840"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000841",
      label: "Salla Sync Forbidden",
    })

    const provider = new SallaIntegrationProvider(database)
    const started = await provider.oauthStart(
      { ...actor, workspaceId, roles: ["owner" as const] },
      { workspaceId }
    )
    const connectionId = (started as { connectionId: string }).connectionId

    const viewerActor = { ...actor, workspaceId, roles: ["viewer" as const] }
    await expect(
      provider.sync(viewerActor, {
        connectionId,
        customerId: "778899",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-forbidden",
      })
    ).rejects.toMatchObject({ code: "SALLA_SYNC_FORBIDDEN", status: 403 })
  })

  it("rejects sync for a customerId that isn't an accessible store on this connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "salla-sync-invalid-account@madar.test",
      "Salla Sync Invalid Account Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000000850"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000000851",
      label: "Salla Sync Invalid Account",
    })

    mockSallaResponses({
      baseUrl,
      accessToken: "salla-access-invalid",
      refreshToken: "salla-refresh-invalid",
      store: { id: "5566", name: "Invalid Account Store" },
      data: {},
    })

    const started = await connectSalla({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/salla/sync`, {
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
    expect(body.code).toBe("SALLA_INVALID_ACCOUNT")
  })
})
