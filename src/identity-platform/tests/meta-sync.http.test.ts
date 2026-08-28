// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { MetaAdsIntegrationProvider } from "../integrations/meta-ads/provider"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { ShopifyIntegrationProvider } from "../integrations/shopify/provider"
import { SallaIntegrationProvider } from "../integrations/salla/provider"
import { GoogleAnalyticsIntegrationProvider } from "../integrations/google-analytics/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

interface MockMetaDataConfig {
  campaigns?: Array<Record<string, unknown>>
  campaignsPageSize?: number
  adsets?: Array<Record<string, unknown>>
  ads?: Array<Record<string, unknown>>
  insights?: Array<Record<string, unknown>>
  adsetInsights?: Array<Record<string, unknown>>
  adInsights?: Array<Record<string, unknown>>
  campaignsShouldFail?: boolean
}

// Simulates the Graph API's cursor pagination: paging.next is a full URL carrying an
// "after" cursor; absent on the last page.
function paginateGraphStyle(input: {
  url: string
  items: Array<Record<string, unknown>>
  pageSize: number
}) {
  const parsed = new URL(input.url)
  const after = parsed.searchParams.get("after")
  const page = after ? Number(after) : 0
  const start = page * input.pageSize
  const pageItems = input.items.slice(start, start + input.pageSize)
  const hasNext = start + input.pageSize < input.items.length

  const paging: Record<string, unknown> = {}
  if (hasNext) {
    const nextUrl = new URL(input.url)
    nextUrl.searchParams.set("after", String(page + 1))
    paging.next = nextUrl.toString()
  }

  return new Response(JSON.stringify({ data: pageItems, paging }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function mockMetaResponses(input: {
  baseUrl: string
  accessToken: string
  longLivedToken: string
  adAccounts: Array<{ id: string; name: string; account_status?: number }>
  data?: MockMetaDataConfig
}) {
  const nativeFetch = globalThis.fetch
  const campaigns = input.data?.campaigns ?? []
  const campaignsPageSize = input.data?.campaignsPageSize ?? 250
  const adsets = input.data?.adsets ?? []
  const ads = input.data?.ads ?? []
  const insights = input.data?.insights ?? []
  const adsetInsights = input.data?.adsetInsights ?? []
  const adInsights = input.data?.adInsights ?? []

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/oauth/access_token")) {
      const parsed = new URL(url)
      if (parsed.searchParams.get("grant_type") === "fb_exchange_token") {
        return new Response(
          JSON.stringify({
            access_token: input.longLivedToken,
            token_type: "bearer",
            expires_in: 60 * 24 * 60 * 60,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }
      return new Response(
        JSON.stringify({ access_token: input.accessToken, token_type: "bearer", expires_in: 5400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/me/adaccounts")) {
      return new Response(JSON.stringify({ data: input.adAccounts }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.includes("/campaigns")) {
      if (input.data?.campaignsShouldFail) {
        return new Response("{}", { status: 500 })
      }
      return paginateGraphStyle({ url, items: campaigns, pageSize: campaignsPageSize })
    }

    // Must be checked before the generic "/ads" check below -- "/adsets" contains "/ads"
    // as a substring, so the order here matters.
    if (url.includes("/adsets")) {
      return paginateGraphStyle({ url, items: adsets, pageSize: 250 })
    }

    if (url.includes("/ads")) {
      return paginateGraphStyle({ url, items: ads, pageSize: 250 })
    }

    if (url.includes("/insights")) {
      const level = new URL(url).searchParams.get("level")
      const items = level === "adset" ? adsetInsights : level === "ad" ? adInsights : insights
      return paginateGraphStyle({ url, items, pageSize: 250 })
    }

    return new Response("{}", { status: 404 })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  process.env.META_OAUTH_CLIENT_ID = "meta-app-id"
  process.env.META_OAUTH_CLIENT_SECRET = "meta-app-secret"
  process.env.META_OAUTH_REDIRECT_URI =
    "http://localhost:4000/v1/integrations/meta-ads/oauth/callback"
  process.env.META_OAUTH_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  container.infrastructure.integrations?.register(new ShopifyIntegrationProvider(database))
  container.infrastructure.integrations?.register(new SallaIntegrationProvider(database))
  container.infrastructure.integrations?.register(new GoogleAnalyticsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new MetaAdsIntegrationProvider(database))

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
      fullName: "Meta Sync Test",
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
     values ($1, $2, 'hash', 'Meta Sync Test', now()) on conflict (id) do nothing`,
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

async function connectMeta(input: {
  login: { session: { accessToken: string } }
  workspaceId: string
}) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/meta-ads/oauth/start`, {
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
    `${baseUrl}/v1/integrations/meta-ads/oauth/callback?state=${encodeURIComponent(started.state)}&code=meta-code`,
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

describe("meta ads data sync: real campaigns/ads/insights pipeline", () => {
  it("fetches real paginated campaigns/ads/insights and persists them as records", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "meta-sync-full@madar.test",
      "Meta Sync Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001010"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001011",
      label: "Meta Sync Full",
    })

    const accountId = "act_778899"
    const campaigns = Array.from({ length: 17 }, (_, i) => ({
      id: `${3000 + i}`,
      name: `Campaign ${i}`,
      status: "ACTIVE",
      updated_time: "2026-01-01T00:00:00Z",
    }))
    const adsets = [{ id: "5001", campaign_id: "3000", updated_time: "2026-01-01T00:00:00Z" }]
    const ads = [{ id: "7001", campaign_id: "3000", updated_time: "2026-01-02T00:00:00Z" }]
    const insights = [
      {
        campaign_id: "3000",
        campaign_name: "Campaign 0",
        impressions: "100",
        date_start: "2026-01-01",
      },
      {
        campaign_id: "3000",
        campaign_name: "Campaign 0",
        impressions: "120",
        date_start: "2026-01-02",
      },
    ]
    const adsetInsights = [
      {
        campaign_id: "3000",
        adset_id: "5001",
        impressions: "60",
        actions: [{ action_type: "omni_purchase", value: "3" }],
        action_values: [{ action_type: "omni_purchase", value: "150" }],
        date_start: "2026-01-01",
      },
    ]
    const adInsights = [
      {
        campaign_id: "3000",
        adset_id: "5001",
        ad_id: "7001",
        impressions: "40",
        date_start: "2026-01-01",
      },
    ]

    mockMetaResponses({
      baseUrl,
      accessToken: "meta-access-sync",
      longLivedToken: "meta-long-lived-sync",
      adAccounts: [{ id: accountId, name: "Sync Test Account", account_status: 1 }],
      data: { campaigns, campaignsPageSize: 15, adsets, ads, insights, adsetInsights, adInsights },
    })

    const started = await connectMeta({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/meta-ads/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: accountId,
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
    expect(syncResult.metrics.campaigns).toBe(17)
    expect(syncResult.metrics.adsets).toBe(1)
    expect(syncResult.metrics.ads).toBe(1)
    expect(syncResult.metrics.insights).toBe(2)
    expect(syncResult.metrics.adsetInsights).toBe(1)
    expect(syncResult.metrics.adInsights).toBe(1)
    expect(syncResult.metrics.totalRecords).toBe(23)

    const recordRows = await database.query<{
      entity_type: string
      entity_id: string
      payload: Record<string, unknown>
    }>(`select entity_type, entity_id, payload from meta_records where connection_id = $1`, [
      started.connectionId,
    ])
    expect(recordRows.rows).toHaveLength(23)
    expect(recordRows.rows.filter((r) => r.entity_type === "campaigns")).toHaveLength(17)
    // Confirms Graph API cursor pagination actually followed paging.next past page 1 (15 campaigns).
    expect(recordRows.rows.some((r) => r.entity_id === "3016")).toBe(true)
    expect(recordRows.rows.some((r) => r.entity_id === "3000:2026-01-01")).toBe(true)

    const adsetRow = recordRows.rows.find((r) => r.entity_type === "adsets")
    expect(adsetRow?.entity_id).toBe("5001")

    const adsetInsightRow = recordRows.rows.find((r) => r.entity_type === "adset_insights")
    expect(adsetInsightRow?.entity_id).toBe("5001:2026-01-01")
    expect(adsetInsightRow?.payload.actions).toEqual([{ action_type: "omni_purchase", value: "3" }])

    const adInsightRow = recordRows.rows.find((r) => r.entity_type === "ad_insights")
    expect(adInsightRow?.entity_id).toBe("7001:2026-01-01")

    const recordsResponse = await fetch(
      `${baseUrl}/v1/integrations/meta-ads/records?connectionId=${started.connectionId}&customerId=${accountId}&entityType=ads`,
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
    expect(recordsBody.items[0]?.entityId).toBe("7001")
  })

  it("is idempotent: re-running sync with the same idempotencyKey does not re-fetch from Meta", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "meta-sync-idempotent@madar.test",
      "Meta Sync Idempotent Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001020"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001021",
      label: "Meta Sync Idempotent",
    })

    const accountId = "act_112233"
    const fetchSpy = mockMetaResponses({
      baseUrl,
      accessToken: "meta-access-idempotent",
      longLivedToken: "meta-long-lived-idempotent",
      adAccounts: [{ id: accountId, name: "Idempotent Account", account_status: 1 }],
      data: {
        campaigns: [{ id: "1", updated_time: "2026-01-01T00:00:00Z" }],
        ads: [],
        insights: [],
      },
    })

    const started = await connectMeta({ login, workspaceId })

    const syncInput = {
      connectionId: started.connectionId,
      customerId: accountId,
      startDate: "2026-01-01",
      endDate: "2026-01-08",
      idempotencyKey: "sync-run-idempotent",
      mode: "incremental" as const,
      trigger: "manual" as const,
    }

    // fetchSpy also records the test's own outer HTTP calls to the local server (they pass
    // through to nativeFetch but are still logged) -- only calls to Meta's real API domain
    // reflect whether the sync engine itself did any work.
    const externalCallCount = () =>
      fetchSpy.mock.calls.filter(([rawInput]) => {
        const url = typeof rawInput === "string" ? rawInput : String(rawInput)
        return !url.startsWith(baseUrl)
      }).length

    const first = await fetch(`${baseUrl}/v1/integrations/meta-ads/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(first.status).toBe(200)
    const externalCallsAfterFirst = externalCallCount()

    const second = await fetch(`${baseUrl}/v1/integrations/meta-ads/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { metrics: Record<string, number> }

    // No new Meta API calls at all -- the second call returned the cached completed run.
    expect(externalCallCount()).toBe(externalCallsAfterFirst)
    expect(secondBody.metrics.campaigns).toBe(1)
  })

  it("deletes the connection cleanly after a sync has written records (no FK violation)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "meta-sync-delete@madar.test",
      "Meta Sync Delete Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001025"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001026",
      label: "Meta Sync Delete",
    })

    const accountId = "act_113344"
    mockMetaResponses({
      baseUrl,
      accessToken: "meta-access-delete",
      longLivedToken: "meta-long-lived-delete",
      adAccounts: [{ id: accountId, name: "Delete Account", account_status: 1 }],
      data: {
        campaigns: [{ id: "1", updated_time: "2026-01-01T00:00:00Z" }],
        ads: [],
        insights: [],
      },
    })

    const started = await connectMeta({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/meta-ads/sync`, {
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
      `select id from meta_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsBefore.rows.length).toBeGreaterThan(0)

    const deleteResponse = await fetch(`${baseUrl}/v1/integrations/${started.connectionId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.session.accessToken}` },
    })
    expect(deleteResponse.status).toBe(204)

    const runsAfter = await database.query(
      `select id from meta_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsAfter.rows).toHaveLength(0)
    const recordsAfter = await database.query(
      `select id from meta_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordsAfter.rows).toHaveLength(0)
  })

  it("marks the sync run failed when Meta's API errors, without corrupting the connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "meta-sync-failure@madar.test",
      "Meta Sync Failure Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001030"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001031",
      label: "Meta Sync Failure",
    })

    const accountId = "act_334455"
    mockMetaResponses({
      baseUrl,
      accessToken: "meta-access-failure",
      longLivedToken: "meta-long-lived-failure",
      adAccounts: [{ id: accountId, name: "Failure Account", account_status: 1 }],
      data: { campaignsShouldFail: true },
    })

    const started = await connectMeta({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/meta-ads/sync`, {
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
    // A bare 500 with no recognized Meta error envelope classifies as a retryable
    // transient failure (meta-ads/errors.ts) -> 503, not a generic 502.
    expect(syncResponse.status).toBe(503)

    const runRows = await database.query<{ status: string; error_code: string | null }>(
      `select status, error_code from meta_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runRows.rows[0]?.status).toBe("failed")
    expect(runRows.rows[0]?.error_code).toBe("META_ADS_TRANSIENT_FAILURE")

    const connectionRows = await database.query<{ status: string }>(
      `select status from meta_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("connected")
  }, 15000)

  it("rejects sync from a non-owner/admin actor", async () => {
    const { actor } = await registerAndProvisionOrg(
      "meta-sync-forbidden@madar.test",
      "Meta Sync Forbidden Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001040"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001041",
      label: "Meta Sync Forbidden",
    })

    const provider = new MetaAdsIntegrationProvider(database)
    const started = await provider.oauthStart(
      { ...actor, workspaceId, roles: ["owner" as const] },
      { workspaceId }
    )
    const connectionId = (started as { connectionId: string }).connectionId

    const viewerActor = { ...actor, workspaceId, roles: ["viewer" as const] }
    await expect(
      provider.sync(viewerActor, {
        connectionId,
        customerId: "act_778899",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-forbidden",
      })
    ).rejects.toMatchObject({ code: "META_SYNC_FORBIDDEN", status: 403 })
  })

  it("rejects sync for a customerId that isn't an accessible ad account on this connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "meta-sync-invalid-account@madar.test",
      "Meta Sync Invalid Account Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001050"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001051",
      label: "Meta Sync Invalid Account",
    })

    mockMetaResponses({
      baseUrl,
      accessToken: "meta-access-invalid",
      longLivedToken: "meta-long-lived-invalid",
      adAccounts: [{ id: "act_556677", name: "Invalid Account", account_status: 1 }],
      data: {},
    })

    const started = await connectMeta({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/meta-ads/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "not-a-real-account-id",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-invalid-account",
      }),
    })
    expect(syncResponse.status).toBe(400)
    const body = (await syncResponse.json()) as { code: string }
    expect(body.code).toBe("META_INVALID_ACCOUNT")
  })
})
