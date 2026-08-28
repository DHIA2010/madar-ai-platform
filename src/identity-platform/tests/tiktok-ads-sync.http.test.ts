// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { TikTokAdsIntegrationProvider } from "../integrations/tiktok-ads/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

interface MockTikTokAdsDataConfig {
  campaigns?: Array<Record<string, unknown>>
  adgroups?: Array<Record<string, unknown>>
  ads?: Array<Record<string, unknown>>
  insights?: Array<{ dimensions: Record<string, unknown>; metrics: Record<string, unknown> }>
  adgroupInsights?: Array<{ dimensions: Record<string, unknown>; metrics: Record<string, unknown> }>
  adInsights?: Array<{ dimensions: Record<string, unknown>; metrics: Record<string, unknown> }>
  campaignsShouldFail?: boolean
}

const LIST_PAGE_SIZE = 100

// Confirmed against TikTok's Business API SDK docs (CampaignCreationApi/AdgroupApi/AdApi):
// campaign/get, adgroup/get, and ad/get all share {data: {list, page_info: {total_page}}}.
function paginateList(input: { items: Array<Record<string, unknown>>; page: number }) {
  const start = (input.page - 1) * LIST_PAGE_SIZE
  const list = input.items.slice(start, start + LIST_PAGE_SIZE)
  return {
    code: 0,
    message: "OK",
    data: {
      list,
      page_info: {
        page: input.page,
        page_size: LIST_PAGE_SIZE,
        total_number: input.items.length,
        total_page: Math.max(1, Math.ceil(input.items.length / LIST_PAGE_SIZE)),
      },
    },
  }
}

function mockTikTokAdsResponses(input: {
  baseUrl: string
  accessToken: string
  advertiser: { id: string; name: string; currency?: string; timezone?: string }
  data?: MockTikTokAdsDataConfig
}) {
  const nativeFetch = globalThis.fetch
  const campaigns = input.data?.campaigns ?? []
  const adgroups = input.data?.adgroups ?? []
  const ads = input.data?.ads ?? []
  const insights = input.data?.insights ?? []
  const adgroupInsights = input.data?.adgroupInsights ?? []
  const adInsights = input.data?.adInsights ?? []

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/oauth2/access_token/")) {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "OK",
          data: { access_token: input.accessToken, advertiser_ids: [input.advertiser.id] },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/advertiser/info/")) {
      return new Response(
        JSON.stringify({
          code: 0,
          message: "OK",
          data: {
            list: [
              {
                advertiser_id: input.advertiser.id,
                name: input.advertiser.name,
                currency: input.advertiser.currency ?? "SAR",
                timezone: input.advertiser.timezone ?? "Asia/Riyadh",
                status: "STATUS_ENABLE",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes("/campaign/get/")) {
      if (input.data?.campaignsShouldFail) {
        return new Response(JSON.stringify({ code: 40001, message: "Internal error" }), {
          status: 500,
        })
      }
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get("page") ?? "1")
      return new Response(JSON.stringify(paginateList({ items: campaigns, page })), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.includes("/adgroup/get/")) {
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get("page") ?? "1")
      return new Response(JSON.stringify(paginateList({ items: adgroups, page })), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.includes("/ad/get/")) {
      const parsed = new URL(url)
      const page = Number(parsed.searchParams.get("page") ?? "1")
      return new Response(JSON.stringify(paginateList({ items: ads, page })), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.includes("/report/integrated/get/")) {
      // Real TikTok rejects any single request spanning more than 30 days when
      // stat_time_day is a dimension (confirmed live: code 40002) -- the sync service walks
      // 30-day windows, so this mock must only return rows whose stat_time_day actually falls
      // inside the requested [start_date, end_date], matching the real API's per-window
      // filtering, otherwise every window would echo back the full fixture and inflate counts.
      const parsed = new URL(url)
      const windowStart = parsed.searchParams.get("start_date") ?? ""
      const windowEnd = parsed.searchParams.get("end_date") ?? ""
      const dataLevel = parsed.searchParams.get("data_level")
      const source =
        dataLevel === "AUCTION_ADGROUP"
          ? adgroupInsights
          : dataLevel === "AUCTION_AD"
            ? adInsights
            : insights
      const windowItems = source.filter((item) => {
        const day = String(item.dimensions.stat_time_day ?? "").slice(0, 10)
        return day >= windowStart && day <= windowEnd
      })
      return new Response(
        JSON.stringify({
          code: 0,
          message: "OK",
          data: {
            list: windowItems,
            page_info: {
              page: 1,
              page_size: 100,
              total_number: windowItems.length,
              total_page: 1,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    return new Response(JSON.stringify({ code: 0, data: { list: [] } }), { status: 200 })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  process.env.TIKTOK_ADS_CLIENT_ID = "tiktok-ads-client-id"
  process.env.TIKTOK_ADS_CLIENT_SECRET = "tiktok-ads-client-secret"
  process.env.TIKTOK_ADS_REDIRECT_URI =
    "http://localhost:4000/v1/integrations/tiktok-ads/oauth/callback"
  // Production throttles to 8 req/s (see sync-service.ts) -- fine for a real sync but would
  // make walking 90+ mocked insight windows take 10+ real seconds here for no reason.
  process.env.TIKTOK_ADS_TARGET_QPS = "1000"
  process.env.TIKTOK_ADS_OAUTH_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  container.infrastructure.integrations?.register(new TikTokAdsIntegrationProvider(database))

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
      fullName: "TikTok Ads Sync Test",
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
     values ($1, $2, 'hash', 'TikTok Ads Sync Test', now()) on conflict (id) do nothing`,
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

async function connectTikTokAds(input: {
  login: { session: { accessToken: string } }
  workspaceId: string
}) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/tiktok-ads/oauth/start`, {
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
    `${baseUrl}/v1/integrations/tiktok-ads/oauth/callback?state=${encodeURIComponent(started.state)}&code=tiktok-ads-code`,
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

describe("tiktok ads data sync: real campaigns/adgroups/ads/insights pipeline", () => {
  it("fetches real paginated campaigns/adgroups/ads/insights and persists them as records", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "tiktok-ads-sync-full@madar.test",
      "TikTok Ads Sync Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001400"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001401",
      label: "TikTok Ads Sync Full",
    })

    const campaigns = Array.from({ length: 120 }, (_, i) => ({
      campaign_id: `camp-${i}`,
      campaign_name: `Campaign ${i}`,
      modify_time: "2026-01-01 00:00:00",
    }))
    const adgroups = [
      { adgroup_id: "ag-1", campaign_id: "camp-0", modify_time: "2026-01-01 00:00:00" },
    ]
    const ads = [{ ad_id: "ad-1", adgroup_id: "ag-1", modify_time: "2026-01-01 00:00:00" }]
    const insights = [
      {
        dimensions: { campaign_id: "camp-0", stat_time_day: "2026-01-01 00:00:00" },
        metrics: { spend: "5.00", impressions: "1000" },
      },
    ]
    const adgroupInsights = [
      {
        dimensions: { adgroup_id: "ag-1", stat_time_day: "2026-01-01 00:00:00" },
        metrics: { spend: "3.00", impressions: "600" },
      },
    ]
    const adInsights = [
      {
        dimensions: { ad_id: "ad-1", stat_time_day: "2026-01-01 00:00:00" },
        metrics: { spend: "2.00", impressions: "400" },
      },
    ]

    const fetchSpy = mockTikTokAdsResponses({
      baseUrl,
      accessToken: "tiktok-ads-access-full",
      advertiser: { id: "998877", name: "Full Advertiser" },
      data: { campaigns, adgroups, ads, insights, adgroupInsights, adInsights },
    })

    const started = await connectTikTokAds({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/tiktok-ads/sync`, {
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
    expect(syncResult.metrics.campaigns).toBe(120)
    expect(syncResult.metrics.adgroups).toBe(1)
    expect(syncResult.metrics.ads).toBe(1)
    expect(syncResult.metrics.insights).toBe(1)
    expect(syncResult.metrics.adgroupInsights).toBe(1)
    expect(syncResult.metrics.adInsights).toBe(1)
    expect(syncResult.metrics.totalRecords).toBe(125)

    const recordRows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from tiktok_ads_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordRows.rows).toHaveLength(125)
    expect(recordRows.rows.filter((r) => r.entity_type === "campaigns")).toHaveLength(120)
    // Confirms page-based pagination actually walked past page 1 (100 campaigns/page).
    expect(recordRows.rows.some((r) => r.entity_id === "camp-119")).toBe(true)
    expect(recordRows.rows.some((r) => r.entity_id === "camp-0:2026-01-01 00:00:00")).toBe(true)
    expect(
      recordRows.rows.some(
        (r) => r.entity_type === "adgroup_insights" && r.entity_id === "ag-1:2026-01-01 00:00:00"
      )
    ).toBe(true)
    expect(
      recordRows.rows.some(
        (r) => r.entity_type === "ad_insights" && r.entity_id === "ad-1:2026-01-01 00:00:00"
      )
    ).toBe(true)

    const campaignsCall = fetchSpy.mock.calls.find(([reqInput]) =>
      String(reqInput).includes("/campaign/get/")
    )
    const campaignsHeaders = campaignsCall?.[1]?.headers as Record<string, string> | undefined
    expect(campaignsHeaders?.["access-token"]).toBe("tiktok-ads-access-full")

    const recordsResponse = await fetch(
      `${baseUrl}/v1/integrations/tiktok-ads/records?connectionId=${started.connectionId}&customerId=998877&entityType=adgroups`,
      { headers: { authorization: `Bearer ${login.session.accessToken}` } }
    )
    expect(recordsResponse.status).toBe(200)
    const recordsBody = (await recordsResponse.json()) as { items: Array<{ entityId: string }> }
    expect(recordsBody.items).toHaveLength(1)
    expect(recordsBody.items[0]?.entityId).toBe("ag-1")
  })

  it("is idempotent: re-running sync with the same idempotencyKey does not re-fetch from TikTok", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "tiktok-ads-sync-idempotent@madar.test",
      "TikTok Ads Sync Idempotent Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001410"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001411",
      label: "TikTok Ads Sync Idempotent",
    })

    const fetchSpy = mockTikTokAdsResponses({
      baseUrl,
      accessToken: "tiktok-ads-access-idempotent",
      advertiser: { id: "112233", name: "Idempotent Advertiser" },
      data: {
        campaigns: [{ campaign_id: "c1", modify_time: "2026-01-01 00:00:00" }],
        adgroups: [],
        ads: [],
        insights: [],
      },
    })

    const started = await connectTikTokAds({ login, workspaceId })

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
    // through to nativeFetch but are still logged) -- only calls to TikTok's real API domain
    // reflect whether the sync engine itself did any work.
    const externalCallCount = () =>
      fetchSpy.mock.calls.filter(([rawInput]) => {
        const url = typeof rawInput === "string" ? rawInput : String(rawInput)
        return !url.startsWith(baseUrl)
      }).length

    const first = await fetch(`${baseUrl}/v1/integrations/tiktok-ads/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(first.status).toBe(200)
    const externalCallsAfterFirst = externalCallCount()

    const second = await fetch(`${baseUrl}/v1/integrations/tiktok-ads/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { metrics: Record<string, number> }

    // No new TikTok API calls at all -- the second call returned the cached completed run.
    expect(externalCallCount()).toBe(externalCallsAfterFirst)
    expect(secondBody.metrics.campaigns).toBe(1)
  })

  it("marks the sync run failed when TikTok's API errors, without corrupting the connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "tiktok-ads-sync-failure@madar.test",
      "TikTok Ads Sync Failure Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001420"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001421",
      label: "TikTok Ads Sync Failure",
    })

    const accountId = "334455"
    mockTikTokAdsResponses({
      baseUrl,
      accessToken: "tiktok-ads-access-failure",
      advertiser: { id: accountId, name: "Failure Advertiser" },
      data: { campaignsShouldFail: true },
    })

    const started = await connectTikTokAds({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/tiktok-ads/sync`, {
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
      `select status, error_code from tiktok_ads_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runRows.rows[0]?.status).toBe("failed")
    expect(runRows.rows[0]?.error_code).toBe("TIKTOK_ADS_SYNC_API_REQUEST_FAILED")

    const connectionRows = await database.query<{ status: string }>(
      `select status from tiktok_ads_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("connected")
  })

  it("rejects sync from a non-owner/admin actor", async () => {
    const { actor } = await registerAndProvisionOrg(
      "tiktok-ads-sync-forbidden@madar.test",
      "TikTok Ads Sync Forbidden Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001430"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001431",
      label: "TikTok Ads Sync Forbidden",
    })

    const provider = new TikTokAdsIntegrationProvider(database)
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
    ).rejects.toMatchObject({ code: "TIKTOK_ADS_SYNC_FORBIDDEN", status: 403 })
  })

  it("rejects sync for a customerId that isn't an accessible advertiser account on this connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "tiktok-ads-sync-invalid-account@madar.test",
      "TikTok Ads Sync Invalid Account Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001440"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001441",
      label: "TikTok Ads Sync Invalid Account",
    })

    mockTikTokAdsResponses({
      baseUrl,
      accessToken: "tiktok-ads-access-invalid",
      advertiser: { id: "556677", name: "Invalid Account Advertiser" },
      data: {},
    })

    const started = await connectTikTokAds({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/tiktok-ads/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "not-a-real-advertiser-id",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-invalid-account",
      }),
    })
    expect(syncResponse.status).toBe(400)
    const body = (await syncResponse.json()) as { code: string }
    expect(body.code).toBe("TIKTOK_ADS_INVALID_ACCOUNT")
  })

  it("deletes the connection cleanly after a sync has written records (no FK violation)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "tiktok-ads-sync-delete@madar.test",
      "TikTok Ads Sync Delete Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001450"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001451",
      label: "TikTok Ads Sync Delete",
    })

    const accountId = "445566"
    mockTikTokAdsResponses({
      baseUrl,
      accessToken: "tiktok-ads-access-delete",
      advertiser: { id: accountId, name: "Delete Advertiser" },
      data: {
        campaigns: [{ campaign_id: "c1", modify_time: "2026-01-01 00:00:00" }],
        adgroups: [],
        ads: [],
        insights: [],
      },
    })

    const started = await connectTikTokAds({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/tiktok-ads/sync`, {
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
      `select id from tiktok_ads_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsBefore.rows.length).toBeGreaterThan(0)

    const deleteResponse = await fetch(`${baseUrl}/v1/integrations/${started.connectionId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.session.accessToken}` },
    })
    expect(deleteResponse.status).toBe(204)

    const runsAfter = await database.query(
      `select id from tiktok_ads_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsAfter.rows).toHaveLength(0)
    const recordsAfter = await database.query(
      `select id from tiktok_ads_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordsAfter.rows).toHaveLength(0)
  })
})
