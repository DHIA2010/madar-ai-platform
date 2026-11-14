// @vitest-environment node

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { resolveInsightsRanges } from "../google-analytics-oauth/insights-service"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { GoogleAnalyticsIntegrationProvider } from "../integrations/google-analytics/provider"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

const PROPERTY_ID = "778899"
const INSIGHTS_PATH = "/v1/integrations/google-analytics/insights"

interface ReportBody {
  dateRanges: Array<{ startDate: string; endDate: string; name?: string }>
  dimensions: Array<{ name: string }>
  metrics: Array<{ name: string }>
  orderBys?: unknown[]
  limit?: string
}

function reportResponse(dimensionNames: string[], metricNames: string[], rows: string[][]) {
  return new Response(
    JSON.stringify({
      dimensionHeaders: dimensionNames.map((name) => ({ name })),
      metricHeaders: metricNames.map((name) => ({ name })),
      rows: rows.map((row) => ({
        dimensionValues: row.slice(0, dimensionNames.length).map((value) => ({ value })),
        metricValues: row.slice(dimensionNames.length).map((value) => ({ value })),
      })),
      rowCount: rows.length,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
}

// Google's side: the OAuth token exchange, the property list, and the reports of one property.
function mockGoogle(options: { reportStatus?: number } = {}) {
  const nativeFetch = globalThis.fetch
  const reports: ReportBody[] = []

  vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput, init) => {
    const url = typeof rawInput === "string" ? rawInput : rawInput.toString()
    if (url.startsWith(baseUrl)) return nativeFetch(rawInput, init)

    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(
        JSON.stringify({
          access_token: "ga-access-insights",
          refresh_token: "ga-refresh-insights",
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
              name: "accountSummaries/acct-1",
              account: "accounts/acct-1",
              displayName: "Insights Account",
              propertySummaries: [
                {
                  property: `properties/${PROPERTY_ID}`,
                  displayName: "Madar Store",
                  propertyType: "PROPERTY_TYPE_ORDINARY",
                  parent: "accounts/acct-1",
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }

    if (url.endsWith(`/properties/${PROPERTY_ID}:runReport`) && init?.method === "POST") {
      if (options.reportStatus) return new Response("{}", { status: options.reportStatus })
      const body = JSON.parse(typeof init.body === "string" ? init.body : "{}") as ReportBody
      reports.push(body)
      const dimensions = body.dimensions.map((dimension) => dimension.name)
      const metrics = body.metrics.map((metric) => metric.name)

      if (dimensions.length === 0) {
        return reportResponse(["dateRange"], metrics, [
          ["current", "120", "80", "200", "640", "0.61", "95.5", "14"],
          ["previous", "100", "70", "160", "500", "0.5", "80", "7"],
        ])
      }
      if (dimensions[0] === "date") {
        return reportResponse(dimensions, metrics, [
          ["20260301", "40", "70", "220"],
          ["20260302", "90", "130", "420"],
        ])
      }
      if (dimensions[0] === "pagePath") {
        return reportResponse(dimensions, metrics, [
          ["/", "300", "100"],
          ["/pricing", "120", "60"],
        ])
      }
      if (dimensions[0] === "sessionDefaultChannelGroup") {
        return reportResponse(dimensions, metrics, [
          ["Paid Social", "110"],
          ["Direct", "90"],
        ])
      }
      if (dimensions[0] === "sessionSource") {
        return reportResponse(dimensions, metrics, [["snapchat", "paid_social", "110", "70"]])
      }
      if (dimensions[0] === "country") {
        return reportResponse(dimensions, metrics, [
          ["Saudi Arabia", "SA", "100"],
          ["(not set)", "(not set)", "3"],
        ])
      }
      if (dimensions[0] === "deviceCategory") {
        return reportResponse(dimensions, metrics, [
          ["mobile", "95"],
          ["desktop", "25"],
        ])
      }
      if (dimensions[0] === "eventName") {
        return reportResponse(dimensions, metrics, [
          ["page_view", "640"],
          ["generate_lead", "14"],
        ])
      }
    }

    return new Response("{}", { status: 404 })
  })

  return { reports }
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
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await database.end()
})

// An organization with one workspace and project. `settings` decides which apps it has.
async function provisionOrg(email: string, settings: Record<string, boolean>) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "GA4 Insights Test",
      organizationName: `Org ${email}`,
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
     values ($1, $2, 'hash', 'GA4 Insights Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, $2, $3, 'active', $4::jsonb) on conflict (id) do nothing`,
    [actor.organizationId, `Org ${email}`, actor.userId, JSON.stringify(settings)]
  )

  const workspaceId = actor.workspaceId ?? "00000000-0000-4000-8000-000000001610"
  await database.query(
    `insert into workspaces (id, organization_id, name, status)
     values ($1, $2, 'Insights Workspace', 'active') on conflict (id) do nothing`,
    [workspaceId, actor.organizationId]
  )
  await database.query(
    `insert into projects (id, organization_id, workspace_id, owner_user_id, name, status)
     values ($1, $2, $3, $4, 'Insights Project', 'active') on conflict (id) do nothing`,
    ["00000000-0000-4000-8000-000000001611", actor.organizationId, workspaceId, actor.userId]
  )

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${login.session.accessToken}`,
    "x-workspace-id": workspaceId,
  }
  return { headers, workspaceId }
}

async function connectGoogleAnalytics(headers: Record<string, string>, workspaceId: string) {
  const startResponse = await fetch(`${baseUrl}/v1/integrations/google-analytics/oauth/start`, {
    method: "POST",
    headers,
    body: JSON.stringify({ workspaceId }),
  })
  const started = (await startResponse.json()) as { state: string; connectionId: string }
  await fetch(
    `${baseUrl}/v1/integrations/google-analytics/oauth/callback?state=${encodeURIComponent(started.state)}&code=ga-code`,
    { redirect: "manual" }
  )
  return started
}

describe("google analytics insights: what the website analytics page shows", () => {
  it("says nothing is connected before a google analytics account is linked", async () => {
    mockGoogle()
    const { headers } = await provisionOrg("ga-insights-none@madar.test", {
      advertisingEnabled: true,
    })

    const response = await fetch(`${baseUrl}${INSIGHTS_PATH}`, { headers })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "not_connected" })
  })

  it("answers an advertising-only account with the property's numbers for the chosen dates", async () => {
    const google = mockGoogle()
    const { headers, workspaceId } = await provisionOrg("ga-insights-ads@madar.test", {
      advertisingEnabled: true,
    })
    await connectGoogleAnalytics(headers, workspaceId)

    const response = await fetch(
      `${baseUrl}${INSIGHTS_PATH}?startDate=2026-03-01&endDate=2026-03-07`,
      { headers }
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      status: "ready",
      property: { id: PROPERTY_ID, name: "Madar Store" },
      range: { startDate: "2026-03-01", endDate: "2026-03-07" },
      previousRange: { startDate: "2026-02-22", endDate: "2026-02-28" },
      totals: {
        users: 120,
        newUsers: 80,
        sessions: 200,
        pageViews: 640,
        engagementRate: 0.61,
        averageSessionDuration: 95.5,
        keyEvents: 14,
      },
      previousTotals: { users: 100, sessions: 160, pageViews: 500, keyEvents: 7 },
      daily: [
        { date: "2026-03-01", users: 40, sessions: 70, pageViews: 220 },
        { date: "2026-03-02", users: 90, sessions: 130, pageViews: 420 },
      ],
      pages: [
        { path: "/", pageViews: 300, users: 100 },
        { path: "/pricing", pageViews: 120, users: 60 },
      ],
      channels: [
        { channel: "Paid Social", sessions: 110 },
        { channel: "Direct", sessions: 90 },
      ],
      sources: [{ source: "snapchat", medium: "paid_social", sessions: 110, users: 70 }],
      countries: [
        { country: "Saudi Arabia", countryCode: "SA", users: 100 },
        { country: "(not set)", countryCode: null, users: 3 },
      ],
      devices: [
        { device: "mobile", users: 95 },
        { device: "desktop", users: 25 },
      ],
      events: [
        { name: "page_view", count: 640 },
        { name: "generate_lead", count: 14 },
      ],
    })

    // Totals are asked for both periods in one query; every other report covers the chosen dates.
    expect(google.reports).toHaveLength(8)
    const totals = google.reports.find((report) => report.dimensions.length === 0)
    expect(totals?.dateRanges).toEqual([
      { startDate: "2026-03-01", endDate: "2026-03-07", name: "current" },
      { startDate: "2026-02-22", endDate: "2026-02-28", name: "previous" },
    ])
    const pages = google.reports.find((report) => report.dimensions[0]?.name === "pagePath")
    expect(pages).toMatchObject({
      dateRanges: [{ startDate: "2026-03-01", endDate: "2026-03-07" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "10",
    })
  })

  it("keeps an answer for a few minutes instead of asking google again", async () => {
    const google = mockGoogle()
    const { headers, workspaceId } = await provisionOrg("ga-insights-cache@madar.test", {
      ecommerceEnabled: true,
    })
    await connectGoogleAnalytics(headers, workspaceId)
    const url = `${baseUrl}${INSIGHTS_PATH}?startDate=2026-03-01&endDate=2026-03-07`

    await fetch(url, { headers })
    const second = await fetch(url, { headers })
    expect(second.status).toBe(200)
    expect(google.reports).toHaveLength(8)

    // Other dates are a different question.
    await fetch(`${baseUrl}${INSIGHTS_PATH}?startDate=2026-03-01&endDate=2026-03-08`, { headers })
    expect(google.reports).toHaveLength(16)
  })

  it("asks for a reconnect when google no longer lets madar read the property", async () => {
    mockGoogle({ reportStatus: 403 })
    const { headers, workspaceId } = await provisionOrg("ga-insights-403@madar.test", {
      advertisingEnabled: true,
    })
    await connectGoogleAnalytics(headers, workspaceId)

    const response = await fetch(`${baseUrl}${INSIGHTS_PATH}`, { headers })

    expect(response.status).toBe(409)
    expect(((await response.json()) as { code: string }).code).toBe(
      "GOOGLE_ANALYTICS_RECONNECT_REQUIRED"
    )
  })

  it("refuses dates it can't read and accounts without the ads or e-commerce app", async () => {
    mockGoogle()
    const withAds = await provisionOrg("ga-insights-dates@madar.test", {
      advertisingEnabled: true,
    })
    const badDate = await fetch(`${baseUrl}${INSIGHTS_PATH}?startDate=last-week`, {
      headers: withAds.headers,
    })
    expect(badDate.status).toBe(400)
    const reversed = await fetch(
      `${baseUrl}${INSIGHTS_PATH}?startDate=2026-03-08&endDate=2026-03-01`,
      { headers: withAds.headers }
    )
    expect(reversed.status).toBe(400)

    const posOnly = await provisionOrg("ga-insights-pos@madar.test", { posEnabled: true })
    const refused = await fetch(`${baseUrl}${INSIGHTS_PATH}`, { headers: posOnly.headers })
    expect(refused.status).toBe(403)
  })
})

describe("google analytics insights: date ranges", () => {
  const now = new Date("2026-03-10T09:00:00Z")

  it("defaults to the last 28 days and compares with the 28 days before", () => {
    expect(resolveInsightsRanges({}, now)).toEqual({
      range: { startDate: "2026-02-11", endDate: "2026-03-10" },
      previousRange: { startDate: "2026-01-14", endDate: "2026-02-10" },
    })
  })

  it("compares a single day with the day before", () => {
    expect(resolveInsightsRanges({ startDate: "2026-03-09", endDate: "2026-03-09" }, now)).toEqual({
      range: { startDate: "2026-03-09", endDate: "2026-03-09" },
      previousRange: { startDate: "2026-03-08", endDate: "2026-03-08" },
    })
  })

  it("cuts a very long range to its most recent 400 days", () => {
    const { range } = resolveInsightsRanges({ startDate: "2018-01-01", endDate: "2026-03-10" }, now)
    expect(range).toEqual({ startDate: "2025-02-04", endDate: "2026-03-10" })
  })
})
