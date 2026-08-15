// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { MetaAdsIntegrationProvider } from "../integrations/meta-ads/provider"
import { ShopifyIntegrationProvider } from "../integrations/shopify/provider"
import { SallaIntegrationProvider } from "../integrations/salla/provider"
import { GoogleAnalyticsIntegrationProvider } from "../integrations/google-analytics/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

interface MockBreakdownDailyStat {
  entityId: string
  startTime: string
  endTime?: string
  stats: Record<string, unknown>
}

interface MockSnapchatDataConfig {
  campaigns?: Array<Record<string, unknown>>
  campaignsPageSize?: number
  adSquads?: Array<Record<string, unknown>>
  ads?: Array<Record<string, unknown>>
  campaignDailyStats?: MockBreakdownDailyStat[]
  adDailyStats?: MockBreakdownDailyStat[]
  campaignsShouldFail?: boolean
}

// Simulates Snapchat's wrapped list shape ({ campaigns: [{ sub_request_status, campaign: {...} }] })
// with paging.next_link cursor pagination -- confirmed against Snapchat's own docs.
function paginateSnapchatStyle(input: {
  url: string
  items: Array<Record<string, unknown>>
  listKey: string
  singularKey: string
  pageSize: number
}) {
  const parsed = new URL(input.url)
  const cursor = parsed.searchParams.get("cursor")
  const page = cursor ? Number(cursor) : 0
  const start = page * input.pageSize
  const pageItems = input.items.slice(start, start + input.pageSize)
  const hasNext = start + input.pageSize < input.items.length

  const paging: Record<string, unknown> = {}
  if (hasNext) {
    const nextUrl = new URL(input.url)
    nextUrl.searchParams.set("cursor", String(page + 1))
    paging.next_link = nextUrl.toString()
  }

  return new Response(
    JSON.stringify({
      request_status: "SUCCESS",
      paging,
      [input.listKey]: pageItems.map((item) => ({
        sub_request_status: "SUCCESS",
        [input.singularKey]: item,
      })),
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
}

function mockSnapchatResponses(input: {
  baseUrl: string
  accessToken: string
  refreshToken: string
  organizationId: string
  organizationName: string
  accountId: string
  accountName: string
  data?: MockSnapchatDataConfig
}) {
  const nativeFetch = globalThis.fetch
  const campaigns = input.data?.campaigns ?? []
  const campaignsPageSize = input.data?.campaignsPageSize ?? 250
  const adSquads = input.data?.adSquads ?? []
  const ads = input.data?.ads ?? []
  const campaignDailyStats = input.data?.campaignDailyStats ?? []
  const adDailyStats = input.data?.adDailyStats ?? []

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url.includes("/login/oauth2/access_token")) {
      const body = typeof init?.body === "string" ? init.body : ""
      const params = new URLSearchParams(body)
      const isRefresh = params.get("grant_type") === "refresh_token"
      return new Response(
        JSON.stringify({
          access_token: isRefresh ? `${input.accessToken}-refreshed` : input.accessToken,
          refresh_token: input.refreshToken,
          expires_in: 3600,
          token_type: "Bearer",
          scope: "snapchat-marketing-api",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.endsWith("/me/organizations")) {
      return new Response(
        JSON.stringify({
          organizations: [
            {
              sub_request_status: "SUCCESS",
              organization: { id: input.organizationId, name: input.organizationName },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes(`/organizations/${input.organizationId}/adaccounts`)) {
      return new Response(
        JSON.stringify({
          adaccounts: [
            {
              sub_request_status: "SUCCESS",
              adaccount: {
                id: input.accountId,
                name: input.accountName,
                currency: "USD",
                timezone: "UTC",
                organization_id: input.organizationId,
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.includes(`/adaccounts/${input.accountId}/campaigns`)) {
      if (input.data?.campaignsShouldFail) {
        return new Response("{}", { status: 500 })
      }
      return paginateSnapchatStyle({
        url,
        items: campaigns,
        listKey: "campaigns",
        singularKey: "campaign",
        pageSize: campaignsPageSize,
      })
    }

    if (url.includes(`/adaccounts/${input.accountId}/adsquads`)) {
      return paginateSnapchatStyle({
        url,
        items: adSquads,
        listKey: "adsquads",
        singularKey: "adsquad",
        pageSize: 250,
      })
    }

    if (url.includes(`/adaccounts/${input.accountId}/ads`)) {
      return paginateSnapchatStyle({
        url,
        items: ads,
        listKey: "ads",
        singularKey: "ad",
        pageSize: 250,
      })
    }

    if (url.includes(`/adaccounts/${input.accountId}/stats`)) {
      // The real sync-service walks the account's history in <=32-day chunks (Snapchat's own
      // limit), issuing several requests per breakdown type -- filter fixture entries by the
      // requested start_time/end_time so each chunk only returns its own days, and by the
      // requested breakdown (campaign vs ad) so each series only returns its own entries,
      // matching real behavior. breakdown_stats.<type>[] is an array of per-ENTITY objects,
      // each carrying its own "timeseries" array of per-day stats -- confirmed live against a
      // real account with real spend; it is NOT a top-level array of days.
      const parsed = new URL(url)
      const windowStart = new Date(parsed.searchParams.get("start_time") ?? 0).getTime()
      const windowEnd = new Date(parsed.searchParams.get("end_time") ?? 0).getTime()
      const breakdown = parsed.searchParams.get("breakdown") ?? "campaign"
      const source = breakdown === "ad" ? adDailyStats : campaignDailyStats
      const windowStats = source.filter((stat) => {
        const statTime = new Date(stat.startTime).getTime()
        return statTime >= windowStart && statTime < windowEnd
      })

      const byEntity = new Map<string, MockBreakdownDailyStat[]>()
      for (const stat of windowStats) {
        const existing = byEntity.get(stat.entityId) ?? []
        existing.push(stat)
        byEntity.set(stat.entityId, existing)
      }

      const breakdownEntities = Array.from(byEntity.entries()).map(([entityId, entries]) => ({
        id: entityId,
        timeseries: entries.map((entry) => ({
          start_time: entry.startTime,
          end_time: entry.endTime,
          stats: entry.stats,
        })),
      }))

      return new Response(
        JSON.stringify({
          request_status: "SUCCESS",
          timeseries_stats: [
            {
              sub_request_status: "SUCCESS",
              timeseries_stat: {
                id: input.accountId,
                type: "AD_ACCOUNT",
                breakdown_stats: {
                  [breakdown]: breakdownEntities,
                },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    return new Response("{}", { status: 404 })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  process.env.SNAPCHAT_CLIENT_ID = "snapchat-client-id"
  process.env.SNAPCHAT_CLIENT_SECRET = "snapchat-client-secret"
  process.env.SNAPCHAT_REDIRECT_URI =
    "http://localhost:4000/v1/integrations/snapchat-ads/oauth/callback"
  process.env.SNAPCHAT_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"
  process.env.SNAPCHAT_AUTHORIZATION_URL = "https://accounts.snapchat.com/login/oauth2/authorize"
  process.env.SNAPCHAT_TOKEN_URL = "https://accounts.snapchat.com/login/oauth2/access_token"
  process.env.SNAPCHAT_MARKETING_API_BASE_URL = "https://adsapi.snapchat.com/v1"

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
  container.infrastructure.integrations?.register(new MetaAdsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new ShopifyIntegrationProvider(database))
  container.infrastructure.integrations?.register(new SallaIntegrationProvider(database))
  container.infrastructure.integrations?.register(new GoogleAnalyticsIntegrationProvider(database))
  container.infrastructure.integrations?.register(new SnapchatAdsIntegrationProvider(database))

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
      fullName: "Snapchat Sync Test",
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
     values ($1, $2, 'hash', 'Snapchat Sync Test', now()) on conflict (id) do nothing`,
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

async function connectSnapchat(input: {
  login: { session: { accessToken: string } }
  workspaceId: string
}) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/snapchat-ads/oauth/start`, {
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
    `${baseUrl}/v1/integrations/snapchat-ads/oauth/callback?state=${encodeURIComponent(started.state)}&code=snap-code`,
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

describe("snapchat ads data sync: real campaigns/ads/stats pipeline", () => {
  it("fetches real paginated campaigns/ads/stats and persists them as records", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "snapchat-sync-full@madar.test",
      "Snapchat Sync Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001110"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001111",
      label: "Snapchat Sync Full",
    })

    const accountId = "acc-778899"
    const campaigns = Array.from({ length: 17 }, (_, i) => ({
      id: `camp-${i}`,
      name: `Campaign ${i}`,
      status: "ACTIVE",
      updated_at: "2026-01-01T00:00:00Z",
    }))
    const adSquads = [{ id: "sq-1", campaign_id: "camp-0", updated_at: "2026-01-02T00:00:00Z" }]
    const ads = [
      { id: "ad-1", ad_squad_id: "sq-1", updated_at: "2026-01-02T00:00:00Z" },
      { id: "ad-2", ad_squad_id: "sq-1", updated_at: "2026-01-02T00:00:00Z" },
    ]
    // The real sync-service requests a window from 2025-01-01 to "today" -- fixture dates just
    // need to fall inside that (any recent date relative to "now" works regardless of when the
    // test runs).
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const daysAgo = (n: number) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
    const statDayMinus2 = daysAgo(2)
    const statDayMinus1 = daysAgo(1)
    const campaignDailyStats: MockBreakdownDailyStat[] = [
      { entityId: "camp-0", startTime: statDayMinus2, stats: { impressions: 100, spend: 500 } },
      { entityId: "camp-0", startTime: statDayMinus1, stats: { impressions: 120, spend: 600 } },
      // Second campaign on the same day, to prove breakdown=campaign actually splits by
      // campaign rather than collapsing to one account-level row per day.
      { entityId: "camp-1", startTime: statDayMinus1, stats: { impressions: 40, spend: 200 } },
    ]
    // Both ads belong to ad squad sq-1 -- their sum on statDayMinus1 (impressions: 50,
    // spend: 250) proves ad-squad-level stats are correctly derived by aggregation rather
    // than fetched directly.
    const adDailyStats: MockBreakdownDailyStat[] = [
      { entityId: "ad-1", startTime: statDayMinus1, stats: { impressions: 30, spend: 150 } },
      { entityId: "ad-2", startTime: statDayMinus1, stats: { impressions: 20, spend: 100 } },
    ]

    mockSnapchatResponses({
      baseUrl,
      accessToken: "snap-access-sync",
      refreshToken: "snap-refresh-sync",
      organizationId: "org-1",
      organizationName: "Sync Org",
      accountId,
      accountName: "Sync Test Account",
      data: {
        campaigns,
        campaignsPageSize: 15,
        adSquads,
        ads,
        campaignDailyStats,
        adDailyStats,
      },
    })

    const started = await connectSnapchat({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/snapchat-ads/sync`, {
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
    expect(syncResult.metrics.adSquads).toBe(1)
    expect(syncResult.metrics.ads).toBe(2)
    // 3 campaign-days + 1 ad-squad-day (derived) + 2 ad-days = 6.
    expect(syncResult.metrics.stats).toBe(6)
    expect(syncResult.metrics.totalRecords).toBe(26)

    const recordRows = await database.query<{
      entity_type: string
      entity_id: string
      payload: Record<string, unknown>
    }>(`select entity_type, entity_id, payload from snapchat_records where connection_id = $1`, [
      started.connectionId,
    ])
    expect(recordRows.rows).toHaveLength(26)
    expect(recordRows.rows.filter((r) => r.entity_type === "campaigns")).toHaveLength(17)
    expect(recordRows.rows.filter((r) => r.entity_type === "ad_squads")).toHaveLength(1)
    expect(recordRows.rows.filter((r) => r.entity_type === "ads")).toHaveLength(2)
    // Confirms next_link cursor pagination actually walked past page 1 (15 campaigns).
    expect(recordRows.rows.some((r) => r.entity_id === "camp-16")).toBe(true)
    // Confirms breakdown=campaign actually splits stats per campaign, not one row per account.
    expect(recordRows.rows.some((r) => r.entity_id === `camp-0:${statDayMinus2}`)).toBe(true)
    expect(recordRows.rows.some((r) => r.entity_id === `camp-1:${statDayMinus1}`)).toBe(true)
    // Confirms ad-level stats were fetched per-ad.
    expect(recordRows.rows.some((r) => r.entity_id === `ad-1:${statDayMinus1}`)).toBe(true)
    expect(recordRows.rows.some((r) => r.entity_id === `ad-2:${statDayMinus1}`)).toBe(true)
    // Confirms ad-squad-level stats were correctly derived by summing ad-1 + ad-2's stats
    // (impressions: 30+20=50, spend: 150+100=250), not fetched via a separate API call.
    const squadStatRow = recordRows.rows.find((r) => r.entity_id === `sq-1:${statDayMinus1}`)
    expect(squadStatRow).toBeTruthy()
    expect(squadStatRow?.payload.impressions).toBe(50)
    expect(squadStatRow?.payload.spend).toBe(250)
    expect(squadStatRow?.payload.level).toBe("ad_squad")

    const recordsResponse = await fetch(
      `${baseUrl}/v1/integrations/snapchat-ads/records?connectionId=${started.connectionId}&customerId=${accountId}&entityType=ads`,
      {
        headers: {
          authorization: `Bearer ${login.session.accessToken}`,
          "x-workspace-id": workspaceId,
        },
      }
    )
    expect(recordsResponse.status).toBe(200)
    const recordsBody = (await recordsResponse.json()) as { items: Array<{ entityId: string }> }
    expect(recordsBody.items).toHaveLength(2)
    expect(recordsBody.items.map((item) => item.entityId).sort()).toEqual(["ad-1", "ad-2"])
  })

  it("is idempotent: re-running sync with the same idempotencyKey does not re-fetch from Snapchat", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "snapchat-sync-idempotent@madar.test",
      "Snapchat Sync Idempotent Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001120"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001121",
      label: "Snapchat Sync Idempotent",
    })

    const accountId = "acc-112233"
    const fetchSpy = mockSnapchatResponses({
      baseUrl,
      accessToken: "snap-access-idempotent",
      refreshToken: "snap-refresh-idempotent",
      organizationId: "org-2",
      organizationName: "Idempotent Org",
      accountId,
      accountName: "Idempotent Account",
      data: {
        campaigns: [{ id: "camp-1", updated_at: "2026-01-01T00:00:00Z" }],
        ads: [],
        adSquads: [],
        campaignDailyStats: [],
        adDailyStats: [],
      },
    })

    const started = await connectSnapchat({ login, workspaceId })

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
    // through to nativeFetch but are still logged) -- only calls to Snapchat's real API domain
    // reflect whether the sync engine itself did any work.
    const externalCallCount = () =>
      fetchSpy.mock.calls.filter(([rawInput]) => {
        const url = typeof rawInput === "string" ? rawInput : String(rawInput)
        return !url.startsWith(baseUrl)
      }).length

    const first = await fetch(`${baseUrl}/v1/integrations/snapchat-ads/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(first.status).toBe(200)
    const externalCallsAfterFirst = externalCallCount()

    const second = await fetch(`${baseUrl}/v1/integrations/snapchat-ads/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { metrics: Record<string, number> }

    // No new Snapchat API calls at all -- the second call returned the cached completed run.
    expect(externalCallCount()).toBe(externalCallsAfterFirst)
    expect(secondBody.metrics.campaigns).toBe(1)
  })

  it("deletes the connection cleanly after a sync has written records (no FK violation)", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "snapchat-sync-delete@madar.test",
      "Snapchat Sync Delete Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001125"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001126",
      label: "Snapchat Sync Delete",
    })

    const accountId = "acc-445566"
    mockSnapchatResponses({
      baseUrl,
      accessToken: "snap-access-delete",
      refreshToken: "snap-refresh-delete",
      organizationId: "org-5",
      organizationName: "Delete Org",
      accountId,
      accountName: "Delete Account",
      data: {
        campaigns: [{ id: "camp-1", updated_at: "2026-01-01T00:00:00Z" }],
        ads: [],
        adSquads: [],
        campaignDailyStats: [],
        adDailyStats: [],
      },
    })

    const started = await connectSnapchat({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/snapchat-ads/sync`, {
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
      `select id from snapchat_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsBefore.rows.length).toBeGreaterThan(0)

    const deleteResponse = await fetch(`${baseUrl}/v1/integrations/${started.connectionId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${login.session.accessToken}` },
    })
    expect(deleteResponse.status).toBe(204)

    const runsAfter = await database.query(
      `select id from snapchat_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runsAfter.rows).toHaveLength(0)
    const recordsAfter = await database.query(
      `select id from snapchat_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordsAfter.rows).toHaveLength(0)
  })

  it("marks the sync run failed when Snapchat's API errors, without corrupting the connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "snapchat-sync-failure@madar.test",
      "Snapchat Sync Failure Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001130"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001131",
      label: "Snapchat Sync Failure",
    })

    const accountId = "acc-334455"
    mockSnapchatResponses({
      baseUrl,
      accessToken: "snap-access-failure",
      refreshToken: "snap-refresh-failure",
      organizationId: "org-3",
      organizationName: "Failure Org",
      accountId,
      accountName: "Failure Account",
      data: { campaignsShouldFail: true },
    })

    const started = await connectSnapchat({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/snapchat-ads/sync`, {
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
      `select status, error_code from snapchat_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runRows.rows[0]?.status).toBe("failed")
    expect(runRows.rows[0]?.error_code).toBe("SNAPCHAT_SYNC_API_REQUEST_FAILED")

    const connectionRows = await database.query<{ status: string }>(
      `select status from snapchat_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("connected")
  })

  it("rejects sync from a non-owner/admin actor", async () => {
    const { actor } = await registerAndProvisionOrg(
      "snapchat-sync-forbidden@madar.test",
      "Snapchat Sync Forbidden Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001140"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001141",
      label: "Snapchat Sync Forbidden",
    })

    const provider = new SnapchatAdsIntegrationProvider(database)
    const started = await provider.oauthStart(
      { ...actor, workspaceId, roles: ["owner" as const] },
      { workspaceId }
    )
    const connectionId = (started as { connectionId: string }).connectionId

    const viewerActor = { ...actor, workspaceId, roles: ["viewer" as const] }
    await expect(
      provider.sync(viewerActor, {
        connectionId,
        customerId: "acc-778899",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-forbidden",
      })
    ).rejects.toMatchObject({ code: "SNAPCHAT_SYNC_FORBIDDEN", status: 403 })
  })

  it("rejects sync for a customerId that isn't an accessible ad account on this connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "snapchat-sync-invalid-account@madar.test",
      "Snapchat Sync Invalid Account Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001150"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001151",
      label: "Snapchat Sync Invalid Account",
    })

    mockSnapchatResponses({
      baseUrl,
      accessToken: "snap-access-invalid",
      refreshToken: "snap-refresh-invalid",
      organizationId: "org-4",
      organizationName: "Invalid Org",
      accountId: "acc-556677",
      accountName: "Invalid Account",
      data: {},
    })

    const started = await connectSnapchat({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/snapchat-ads/sync`, {
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
    expect(body.code).toBe("SNAPCHAT_INVALID_ACCOUNT")
  })
})
