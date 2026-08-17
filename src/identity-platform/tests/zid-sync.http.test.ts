// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ZidIntegrationProvider } from "../integrations/zid/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

interface MockZidDataConfig {
  products?: Array<Record<string, unknown>>
  productsPageSize?: number
  orders?: Array<Record<string, unknown>>
  customers?: Array<Record<string, unknown>>
  productsShouldFail?: boolean
}

// DRF-style pagination for the Products resource: results/next/count, "next" carries the
// full next-page URL (confirmed against docs.zid.sa/retrieve-a-list-of-products).
function paginateProducts(input: {
  baseUrl: string
  items: Array<Record<string, unknown>>
  page: number
  pageSize: number
}) {
  const start = (input.page - 1) * input.pageSize
  const results = input.items.slice(start, start + input.pageSize)
  const hasNext = start + input.pageSize < input.items.length
  const nextUrl = new URL(input.baseUrl)
  nextUrl.searchParams.set("page", String(input.page + 1))
  nextUrl.searchParams.set("page_size", String(input.pageSize))

  return {
    results,
    count: input.items.length,
    total_products_count: input.items.length,
    next: hasNext ? nextUrl.toString() : null,
    previous: null,
  }
}

// The Merchant API (orders/customers) doesn't expose a "totalPages" field -- the sync
// service instead walks pages until a page comes back shorter than the requested per_page,
// matching the real API's documented behavior.
function paginateMerchantList(input: {
  items: Array<Record<string, unknown>>
  page: number
  perPage: number
  listKey: "orders" | "customers"
}) {
  const start = (input.page - 1) * input.perPage
  const pageItems = input.items.slice(start, start + input.perPage)
  return {
    [input.listKey]: pageItems,
    grand_total: input.items.length,
  }
}

function mockZidResponses(input: {
  baseUrl: string
  accessToken: string
  refreshToken: string
  store: { id: string; title: string; currencyCode?: string; timezone?: string }
  data?: MockZidDataConfig
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

    if (url.includes("/oauth/token")) {
      const body = typeof init?.body === "string" ? init.body : ""
      const params = new URLSearchParams(body)
      const isRefresh = params.get("grant_type") === "refresh_token"
      return new Response(
        JSON.stringify({
          access_token: isRefresh ? `${input.accessToken}-refreshed` : input.accessToken,
          refresh_token: input.refreshToken,
          expires_in: 3600 * 24 * 365,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/managers/account/profile")) {
      return new Response(
        JSON.stringify({
          user: {
            store: {
              id: input.store.id,
              title: input.store.title,
              currency: { code: input.store.currencyCode ?? "SAR" },
              timezone: input.store.timezone ?? "Asia/Riyadh",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/products/")) {
      if (input.data?.productsShouldFail) {
        return new Response("{}", { status: 500 })
      }
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get("page") ?? "1")
      const base = `${parsed.origin}${parsed.pathname}`
      return new Response(
        JSON.stringify(
          paginateProducts({ baseUrl: base, items: products, page, pageSize: productsPageSize })
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/managers/store/orders")) {
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get("page") ?? "1")
      const perPage = Number(parsed.searchParams.get("per_page") ?? "50")
      return new Response(
        JSON.stringify(paginateMerchantList({ items: orders, page, perPage, listKey: "orders" })),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/managers/store/customers")) {
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get("page") ?? "1")
      const perPage = Number(parsed.searchParams.get("per_page") ?? "50")
      return new Response(
        JSON.stringify(
          paginateMerchantList({ items: customers, page, perPage, listKey: "customers" })
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    return new Response("{}", { status: 404 })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  process.env.ZID_CLIENT_ID = "zid-client-id"
  process.env.ZID_CLIENT_SECRET = "zid-client-secret"
  process.env.ZID_REDIRECT_URI = "http://localhost:4000/v1/integrations/zid/oauth/callback"
  process.env.ZID_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  container.infrastructure.integrations?.register(new ZidIntegrationProvider(database))

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
      fullName: "Zid Sync Test",
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
     values ($1, $2, 'hash', 'Zid Sync Test', now()) on conflict (id) do nothing`,
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

async function connectZid(input: {
  login: { session: { accessToken: string } }
  workspaceId: string
}) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/zid/oauth/start`, {
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
    `${baseUrl}/v1/integrations/zid/oauth/callback?state=${encodeURIComponent(started.state)}&code=zid-code`,
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

describe("zid data sync: real products/orders/customers pipeline", () => {
  it("fetches real paginated products/orders/customers and persists them as records", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "zid-sync-full@madar.test",
      "Zid Sync Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001300"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001301",
      label: "Zid Sync Full",
    })

    const products = Array.from({ length: 17 }, (_, i) => ({
      id: `prod-${i}`,
      updated_at: "2026-01-01T00:00:00Z",
    }))
    const orders = [{ id: 6001, updated_at: "2026-01-02T00:00:00Z" }]
    const customers = [{ id: 7001, updated_at: "2026-01-03T00:00:00Z" }]

    const fetchSpy = mockZidResponses({
      baseUrl,
      accessToken: "zid-access-full",
      refreshToken: "zid-refresh-full",
      store: { id: "998877", title: "Full Store" },
      data: { products, productsPageSize: 15, orders, customers },
    })

    const started = await connectZid({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/zid/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "998877",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-full",
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
    expect(syncResult.metrics.customers).toBe(1)
    expect(syncResult.metrics.totalRecords).toBe(19)

    const recordRows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from zid_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordRows.rows).toHaveLength(19)
    expect(recordRows.rows.filter((r) => r.entity_type === "products")).toHaveLength(17)
    // Confirms DRF-style "next" cursor pagination actually walked past page 1 (15 products).
    expect(recordRows.rows.some((r) => r.entity_id === "prod-16")).toBe(true)

    // Confirms both the Products header scheme (Access-Token/Store-Id) and the Merchant
    // API header scheme (Authorization/X-Manager-Token) were both actually exercised.
    const productsCall = fetchSpy.mock.calls.find(([reqInput]) =>
      String(reqInput).includes("/products/")
    )
    const productsHeaders = productsCall?.[1]?.headers as Record<string, string> | undefined
    expect(productsHeaders?.["access-token"]).toBe("zid-access-full")
    expect(productsHeaders?.["store-id"]).toBe("998877")

    const ordersCall = fetchSpy.mock.calls.find(([reqInput]) =>
      String(reqInput).includes("/managers/store/orders")
    )
    const ordersHeaders = ordersCall?.[1]?.headers as Record<string, string> | undefined
    expect(ordersHeaders?.authorization).toBe("Bearer zid-access-full")
    expect(ordersHeaders?.["x-manager-token"]).toBe("zid-access-full")

    const recordsResponse = await fetch(
      `${baseUrl}/v1/integrations/zid/records?connectionId=${started.connectionId}&customerId=998877&entityType=orders`,
      { headers: { authorization: `Bearer ${login.session.accessToken}` } }
    )
    expect(recordsResponse.status).toBe(200)
    const recordsBody = (await recordsResponse.json()) as { items: Array<{ entityId: string }> }
    expect(recordsBody.items).toHaveLength(1)
    expect(recordsBody.items[0]?.entityId).toBe("6001")
  })

  it("is idempotent: re-running sync with the same idempotencyKey does not re-fetch from Zid", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "zid-sync-idempotent@madar.test",
      "Zid Sync Idempotent Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001310"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001311",
      label: "Zid Sync Idempotent",
    })

    const fetchSpy = mockZidResponses({
      baseUrl,
      accessToken: "zid-access-idempotent",
      refreshToken: "zid-refresh-idempotent",
      store: { id: "112233", title: "Idempotent Store" },
      data: {
        products: [{ id: "p1", updated_at: "2026-01-01T00:00:00Z" }],
        orders: [],
        customers: [],
      },
    })

    const started = await connectZid({ login, workspaceId })

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
    // through to nativeFetch but are still logged) -- only calls to Zid's real API domain
    // reflect whether the sync engine itself did any work.
    const externalCallCount = () =>
      fetchSpy.mock.calls.filter(([rawInput]) => {
        const url = typeof rawInput === "string" ? rawInput : String(rawInput)
        return !url.startsWith(baseUrl)
      }).length

    const first = await fetch(`${baseUrl}/v1/integrations/zid/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(first.status).toBe(200)
    const externalCallsAfterFirst = externalCallCount()

    const second = await fetch(`${baseUrl}/v1/integrations/zid/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { metrics: Record<string, number> }

    // No new Zid API calls at all -- the second call returned the cached completed run.
    expect(externalCallCount()).toBe(externalCallsAfterFirst)
    expect(secondBody.metrics.products).toBe(1)
  })

  it("marks the sync run failed when Zid's API errors, without corrupting the connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "zid-sync-failure@madar.test",
      "Zid Sync Failure Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001320"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001321",
      label: "Zid Sync Failure",
    })

    const accountId = "334455"
    mockZidResponses({
      baseUrl,
      accessToken: "zid-access-failure",
      refreshToken: "zid-refresh-failure",
      store: { id: accountId, title: "Failure Store" },
      data: { productsShouldFail: true },
    })

    const started = await connectZid({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/zid/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: accountId,
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-failure",
        mode: "incremental",
        trigger: "manual",
      }),
    })
    expect(syncResponse.status).toBe(502)

    const runRows = await database.query<{ status: string; error_code: string | null }>(
      `select status, error_code from zid_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runRows.rows[0]?.status).toBe("failed")
    expect(runRows.rows[0]?.error_code).toBe("ZID_SYNC_API_REQUEST_FAILED")

    const connectionRows = await database.query<{ status: string }>(
      `select status from zid_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("connected")
  })

  it("rejects sync from a non-owner/admin actor", async () => {
    const { actor } = await registerAndProvisionOrg(
      "zid-sync-forbidden@madar.test",
      "Zid Sync Forbidden Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001330"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001331",
      label: "Zid Sync Forbidden",
    })

    const provider = new ZidIntegrationProvider(database)
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
    ).rejects.toMatchObject({ code: "ZID_SYNC_FORBIDDEN", status: 403 })
  })

  it("rejects sync for a customerId that isn't an accessible store on this connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "zid-sync-invalid-account@madar.test",
      "Zid Sync Invalid Account Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001340"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001341",
      label: "Zid Sync Invalid Account",
    })

    mockZidResponses({
      baseUrl,
      accessToken: "zid-access-invalid",
      refreshToken: "zid-refresh-invalid",
      store: { id: "556677", title: "Invalid Account Store" },
      data: {},
    })

    const started = await connectZid({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/zid/sync`, {
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
    expect(body.code).toBe("ZID_INVALID_ACCOUNT")
  })

  it("deletes the connection cleanly after a sync has written records (no FK violation)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "zid-sync-delete@madar.test",
      "Zid Sync Delete Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001350"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001351",
      label: "Zid Sync Delete",
    })

    const accountId = "445566"
    mockZidResponses({
      baseUrl,
      accessToken: "zid-access-delete",
      refreshToken: "zid-refresh-delete",
      store: { id: accountId, title: "Delete Store" },
      data: {
        products: [{ id: "p1", updated_at: "2026-01-01T00:00:00Z" }],
        orders: [],
        customers: [],
      },
    })

    const started = await connectZid({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/zid/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: accountId,
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-delete",
        mode: "incremental",
        trigger: "manual",
      }),
    })
    expect(syncResponse.status).toBe(200)

    const runsBefore = await database.query(
      `select id from zid_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsBefore.rows.length).toBeGreaterThan(0)

    const deleteResponse = await fetch(`${baseUrl}/v1/integrations/${started.connectionId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.session.accessToken}` },
    })
    expect(deleteResponse.status).toBe(204)

    const runsAfter = await database.query(
      `select id from zid_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsAfter.rows).toHaveLength(0)
    const recordsAfter = await database.query(
      `select id from zid_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordsAfter.rows).toHaveLength(0)
  })
})
