// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { GoogleAnalyticsIntegrationProvider } from "../integrations/google-analytics/provider"
import { SnapchatAdsIntegrationProvider } from "../integrations/snapchat-ads/provider"
import { MetaAdsIntegrationProvider } from "../integrations/meta-ads/provider"
import { SallaIntegrationProvider } from "../integrations/salla/provider"
import { ShopifyIntegrationProvider } from "../integrations/shopify/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

interface MockGa4RowFixture {
  dimensions: string[]
  metrics: string[]
}

interface MockGa4DataConfig {
  traffic?: MockGa4RowFixture[]
  trafficPageSize?: number
  events?: MockGa4RowFixture[]
  conversions?: MockGa4RowFixture[]
  trafficShouldFail?: boolean
}

const TRAFFIC_METRIC_NAMES = ["sessions", "activeUsers", "screenPageViews", "engagementRate"]
const EVENT_METRIC_NAMES = ["eventCount"]
const CONVERSION_METRIC_NAMES = ["conversions"]

function buildRunReportResponse(input: {
  rows: MockGa4RowFixture[]
  dimensionNames: string[]
  metricNames: string[]
  offset: number
  limit: number
}) {
  const page = input.rows.slice(input.offset, input.offset + input.limit)
  return new Response(
    JSON.stringify({
      dimensionHeaders: input.dimensionNames.map((name) => ({ name })),
      metricHeaders: input.metricNames.map((name) => ({ name })),
      rows: page.map((row) => ({
        dimensionValues: row.dimensions.map((value) => ({ value })),
        metricValues: row.metrics.map((value) => ({ value })),
      })),
      rowCount: input.rows.length,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
}

function mockGoogleAnalyticsResponses(input: {
  baseUrl: string
  accessToken: string
  propertyId: string
  accountId: string
  accountName: string
  propertyName: string
  data?: MockGa4DataConfig
}) {
  const nativeFetch = globalThis.fetch
  const traffic = input.data?.traffic ?? []
  const trafficPageSize = input.data?.trafficPageSize ?? 10000
  const events = input.data?.events ?? []
  const conversions = input.data?.conversions ?? []

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()

    if (url.startsWith(input.baseUrl)) {
      return nativeFetch(rawInput, init)
    }

    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(
        JSON.stringify({
          access_token: input.accessToken,
          refresh_token: "ga-refresh-sync",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "https://www.googleapis.com/auth/analytics.readonly",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.startsWith("https://analyticsadmin.googleapis.com/v1beta/accountSummaries")) {
      return new Response(
        JSON.stringify({
          accountSummaries: [
            {
              name: `accountSummaries/${input.accountId}`,
              account: `accounts/${input.accountId}`,
              displayName: input.accountName,
              propertySummaries: [
                {
                  property: `properties/${input.propertyId}`,
                  displayName: input.propertyName,
                  propertyType: "PROPERTY_TYPE_ORDINARY",
                  parent: `accounts/${input.accountId}`,
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.endsWith(`/properties/${input.propertyId}:runReport`) && init?.method === "POST") {
      const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
        dimensions: Array<{ name: string }>
        offset: string
        limit: string
      }
      const dimensionNames = body.dimensions.map((d) => d.name)
      const offset = Number(body.offset)
      const limit = Number(body.limit)

      const isEventShaped = dimensionNames.includes("eventName")
      if (!isEventShaped) {
        if (input.data?.trafficShouldFail) {
          return new Response("{}", { status: 500 })
        }
        return buildRunReportResponse({
          rows: traffic,
          dimensionNames,
          metricNames: TRAFFIC_METRIC_NAMES,
          offset,
          limit: Math.min(limit, trafficPageSize),
        })
      }

      // Both events and conversions request dimensions=[date, eventName] -- disambiguate by
      // which metric was requested.
      const metricsField = body as unknown as { metrics: Array<{ name: string }> }
      const wantsConversions = metricsField.metrics.some((m) => m.name === "conversions")
      const rows = wantsConversions ? conversions : events
      const metricNames = wantsConversions ? CONVERSION_METRIC_NAMES : EVENT_METRIC_NAMES

      return buildRunReportResponse({ rows, dimensionNames, metricNames, offset, limit })
    }

    return new Response("{}", { status: 404 })
  })
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  process.env.GOOGLE_ANALYTICS_CLIENT_ID = "google-analytics-client-id"
  process.env.GOOGLE_ANALYTICS_CLIENT_SECRET = "google-analytics-client-secret"
  process.env.GOOGLE_ANALYTICS_REDIRECT_URI =
    "http://localhost:4000/v1/integrations/google-analytics/oauth/callback"
  process.env.GOOGLE_ANALYTICS_SUCCESS_REDIRECT_URI = "http://localhost:3000/integrations/new"

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
  container.infrastructure.integrations?.register(new ShopifyIntegrationProvider(database))
  container.infrastructure.integrations?.register(new GoogleAnalyticsIntegrationProvider(database))

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
      fullName: "GA4 Sync Test",
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
     values ($1, $2, 'hash', 'GA4 Sync Test', now()) on conflict (id) do nothing`,
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

async function connectGoogleAnalytics(input: {
  login: { session: { accessToken: string } }
  workspaceId: string
}) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
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
    `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=ga-code`,
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

describe("google analytics data sync: real traffic/events/conversions pipeline", () => {
  it("fetches real paginated traffic/events/conversions reports and persists them as records", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-sync-full@madar.test",
      "GA Sync Full Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001210"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001211",
      label: "GA Sync Full",
    })

    const propertyId = "778899"
    const traffic = Array.from({ length: 17 }, (_, i) => ({
      dimensions: [`202601${String(i + 1).padStart(2, "0")}`],
      metrics: ["100", "50", "200", "0.5"],
    }))
    const events = [{ dimensions: ["20260101", "page_view"], metrics: ["500"] }]
    const conversions = [{ dimensions: ["20260101", "purchase"], metrics: ["12"] }]

    mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-sync",
      propertyId,
      accountId: "acct-1",
      accountName: "Sync Account",
      propertyName: "Sync Property",
      data: { traffic, trafficPageSize: 15, events, conversions },
    })

    const started = await connectGoogleAnalytics({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: propertyId,
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
    expect(syncResult.metrics.traffic).toBe(17)
    expect(syncResult.metrics.events).toBe(1)
    expect(syncResult.metrics.conversions).toBe(1)
    expect(syncResult.metrics.totalRecords).toBe(19)

    const recordRows = await database.query<{ entity_type: string; entity_id: string }>(
      `select entity_type, entity_id from google_analytics_records where connection_id = $1`,
      [started.connectionId]
    )
    expect(recordRows.rows).toHaveLength(19)
    expect(recordRows.rows.filter((r) => r.entity_type === "traffic")).toHaveLength(17)
    expect(recordRows.rows.some((r) => r.entity_id === "2026-01-17")).toBe(true)
    expect(recordRows.rows.some((r) => r.entity_id === "2026-01-01:purchase")).toBe(true)

    const recordsResponse = await fetch(
      `${baseUrl}/v1/integrations/google-analytics/records?connectionId=${started.connectionId}&customerId=${propertyId}&entityType=events`,
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
    expect(recordsBody.items[0]?.entityId).toBe("2026-01-01:page_view")
  })

  it("is idempotent: re-running sync with the same idempotencyKey does not re-fetch from Google Analytics", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-sync-idempotent@madar.test",
      "GA Sync Idempotent Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001220"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001221",
      label: "GA Sync Idempotent",
    })

    const propertyId = "112233"
    const fetchSpy = mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-idempotent",
      propertyId,
      accountId: "acct-2",
      accountName: "Idempotent Account",
      propertyName: "Idempotent Property",
      data: {
        traffic: [{ dimensions: ["20260101"], metrics: ["1", "1", "1", "1"] }],
        events: [],
        conversions: [],
      },
    })

    const started = await connectGoogleAnalytics({ login, workspaceId })

    const syncInput = {
      connectionId: started.connectionId,
      customerId: propertyId,
      startDate: "2026-01-01",
      endDate: "2026-01-08",
      idempotencyKey: "sync-run-idempotent",
      mode: "incremental" as const,
      trigger: "manual" as const,
    }

    // fetchSpy also records the test's own outer HTTP calls to the local server (they pass
    // through to nativeFetch but are still logged) -- only calls to Google's real API domains
    // reflect whether the sync engine itself did any work.
    const externalCallCount = () =>
      fetchSpy.mock.calls.filter(([rawInput]) => {
        const url = typeof rawInput === "string" ? rawInput : String(rawInput)
        return !url.startsWith(baseUrl)
      }).length

    const first = await fetch(`${baseUrl}/v1/integrations/google-analytics/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(first.status).toBe(200)
    const externalCallsAfterFirst = externalCallCount()

    const second = await fetch(`${baseUrl}/v1/integrations/google-analytics/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify(syncInput),
    })
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as { metrics: Record<string, number> }

    // No new Google Analytics API calls at all -- the second call returned the cached
    // completed run.
    expect(externalCallCount()).toBe(externalCallsAfterFirst)
    expect(secondBody.metrics.traffic).toBe(1)
  })

  it("marks the sync run failed when Google Analytics' API errors, without corrupting the connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-sync-failure@madar.test",
      "GA Sync Failure Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001230"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001231",
      label: "GA Sync Failure",
    })

    const propertyId = "334455"
    mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-failure",
      propertyId,
      accountId: "acct-3",
      accountName: "Failure Account",
      propertyName: "Failure Property",
      data: { trafficShouldFail: true },
    })

    const started = await connectGoogleAnalytics({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: propertyId,
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-failure",
        mode: "incremental",
        trigger: "manual",
      }),
    })
    expect(syncResponse.status).toBe(502)

    const runRows = await database.query<{ status: string; error_code: string | null }>(
      `select status, error_code from google_analytics_sync_runs where connection_id = $1`,
      [started.connectionId]
    )
    expect(runRows.rows[0]?.status).toBe("failed")
    expect(runRows.rows[0]?.error_code).toBe("GOOGLE_ANALYTICS_SYNC_API_REQUEST_FAILED")

    const connectionRows = await database.query<{ status: string }>(
      `select status from google_analytics_oauth_connections where id = $1`,
      [started.connectionId]
    )
    expect(connectionRows.rows[0]?.status).toBe("connected")
  })

  it("rejects sync from a non-owner/admin actor", async () => {
    const { actor } = await registerAndProvisionOrg(
      "ga-sync-forbidden@madar.test",
      "GA Sync Forbidden Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001240"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001241",
      label: "GA Sync Forbidden",
    })

    const provider = new GoogleAnalyticsIntegrationProvider(database)
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
    ).rejects.toMatchObject({ code: "GOOGLE_ANALYTICS_SYNC_FORBIDDEN", status: 403 })
  })

  it("rejects sync for a customerId that isn't an accessible property on this connection", async () => {
    const { login, actor } = await registerAndProvisionOrg(
      "ga-sync-invalid-account@madar.test",
      "GA Sync Invalid Account Org"
    )
    const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001250"
    await provisionWorkspaceProject({
      organizationId: actor.organizationId,
      ownerUserId: actor.userId,
      workspaceId,
      projectId: "00000000-0000-4000-8000-000000001251",
      label: "GA Sync Invalid Account",
    })

    mockGoogleAnalyticsResponses({
      baseUrl,
      accessToken: "ga-access-invalid",
      propertyId: "556677",
      accountId: "acct-4",
      accountName: "Invalid Account",
      propertyName: "Invalid Property",
      data: {},
    })

    const started = await connectGoogleAnalytics({ login, workspaceId })

    const syncResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/sync`, {
      method: "POST",
      headers: syncHeaders(login, workspaceId),
      body: JSON.stringify({
        connectionId: started.connectionId,
        customerId: "not-a-real-property-id",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
        idempotencyKey: "sync-run-invalid-account",
      }),
    })
    expect(syncResponse.status).toBe(400)
    const body = (await syncResponse.json()) as { code: string }
    expect(body.code).toBe("GOOGLE_ANALYTICS_INVALID_ACCOUNT")
  })
})
