import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IntegrationProviderError } from "../integrations/provider-error"

import type { GoogleAnalyticsOAuthService } from "./service"

// What the Website analytics page shows for the connected GA4 property. Asked from Google when
// the page is opened (GA4 Data API) rather than added up from the synced daily rows: users can't
// be summed across days (the same visitor on two days would count twice), and pages, sources,
// countries and devices aren't synced at all. An answer is kept for a few minutes, so reloading
// the page costs nothing of the property's API quota.

const DEFAULT_GA4_DATA_API_BASE_URL = "https://analyticsdata.googleapis.com/v1beta"
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_RANGE_DAYS = 28
// One point per day on the trend chart; a longer range is cut to its most recent part.
const MAX_RANGE_DAYS = 400
const CACHE_MS = 5 * 60_000
const CACHE_MAX_ENTRIES = 200
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface GoogleAnalyticsInsightsQuery {
  startDate?: string
  endDate?: string
}

export interface GoogleAnalyticsInsightsTotals {
  users: number
  newUsers: number
  sessions: number
  pageViews: number
  engagementRate: number
  averageSessionDuration: number
  keyEvents: number
}

export interface GoogleAnalyticsInsightsReport {
  status: "ready"
  property: { id: string; name: string }
  range: { startDate: string; endDate: string }
  previousRange: { startDate: string; endDate: string }
  totals: GoogleAnalyticsInsightsTotals
  previousTotals: GoogleAnalyticsInsightsTotals
  daily: Array<{ date: string; users: number; sessions: number; pageViews: number }>
  pages: Array<{ path: string; pageViews: number; users: number }>
  channels: Array<{ channel: string; sessions: number }>
  sources: Array<{ source: string; medium: string; sessions: number; users: number }>
  countries: Array<{ country: string; countryCode: string | null; users: number }>
  devices: Array<{ device: string; users: number }>
  events: Array<{ name: string; count: number }>
  fetchedAt: string
}

// "not_connected": no Google Analytics account is connected (or it's paused) in this workspace.
export type GoogleAnalyticsInsights = { status: "not_connected" } | GoogleAnalyticsInsightsReport

interface Ga4RunReportResponse {
  dimensionHeaders?: Array<{ name: string }>
  metricHeaders?: Array<{ name: string }>
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>
}

interface ReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string; name?: string }>
  dimensions?: string[]
  metrics: string[]
  orderBy?: { metric: string } | { dimension: string }
  limit?: number
}

const EMPTY_TOTALS: GoogleAnalyticsInsightsTotals = {
  users: 0,
  newUsers: 0,
  sessions: 0,
  pageViews: 0,
  engagementRate: 0,
  averageSessionDuration: 0,
  keyEvents: 0,
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function shiftDays(isoDate: string, days: number) {
  return toIsoDate(new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS))
}

function isRealDate(value: string | undefined): value is string {
  return value !== undefined && ISO_DATE.test(value) && !Number.isNaN(new Date(value).getTime())
}

// The range asked for (default: the last 28 days) and the same number of days right before it.
export function resolveInsightsRanges(query: GoogleAnalyticsInsightsQuery, now = new Date()) {
  if (
    (query.startDate !== undefined && !isRealDate(query.startDate)) ||
    (query.endDate !== undefined && !isRealDate(query.endDate))
  ) {
    throw new IntegrationProviderError(
      "Dates must be written as YYYY-MM-DD.",
      "GOOGLE_ANALYTICS_INVALID_DATE_RANGE",
      false,
      400
    )
  }

  const endDate = query.endDate ?? toIsoDate(now)
  let startDate = query.startDate ?? shiftDays(endDate, -(DEFAULT_RANGE_DAYS - 1))
  if (startDate > endDate) {
    throw new IntegrationProviderError(
      "The start date is after the end date.",
      "GOOGLE_ANALYTICS_INVALID_DATE_RANGE",
      false,
      400
    )
  }
  const earliest = shiftDays(endDate, -(MAX_RANGE_DAYS - 1))
  if (startDate < earliest) startDate = earliest

  const days =
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / DAY_MS) + 1
  const previousEnd = shiftDays(startDate, -1)
  return {
    range: { startDate, endDate },
    previousRange: { startDate: shiftDays(previousEnd, -(days - 1)), endDate: previousEnd },
  }
}

function toNumber(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// GA4 writes a day as 20260131.
function fromGaDate(value: string) {
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value
}

function totalsFromRow(row: Record<string, string> | undefined): GoogleAnalyticsInsightsTotals {
  if (!row) return { ...EMPTY_TOTALS }
  return {
    users: toNumber(row.activeUsers),
    newUsers: toNumber(row.newUsers),
    sessions: toNumber(row.sessions),
    pageViews: toNumber(row.screenPageViews),
    engagementRate: toNumber(row.engagementRate),
    averageSessionDuration: toNumber(row.averageSessionDuration),
    keyEvents: toNumber(row.keyEvents),
  }
}

export class GoogleAnalyticsInsightsService {
  private readonly dataApiBaseUrl: string
  private readonly cache = new Map<string, { at: number; report: GoogleAnalyticsInsightsReport }>()

  constructor(
    private readonly oauthService: GoogleAnalyticsOAuthService,
    config?: { dataApiBaseUrl?: string }
  ) {
    this.dataApiBaseUrl = (
      config?.dataApiBaseUrl ??
      process.env.GOOGLE_ANALYTICS_DATA_API_BASE_URL ??
      DEFAULT_GA4_DATA_API_BASE_URL
    ).replace(/\/$/, "")
  }

  async getInsights(
    actor: AuthenticatedActor,
    query: GoogleAnalyticsInsightsQuery,
    now = new Date()
  ): Promise<GoogleAnalyticsInsights> {
    const { range, previousRange } = resolveInsightsRanges(query, now)

    const { connection } = await this.oauthService.getActiveConnection(actor)
    if (!connection || connection.status !== "connected") return { status: "not_connected" }
    // The property chosen when connecting; an account with a single property needs no choosing.
    const property =
      connection.customerAccounts.find((account) => account.isSelected) ??
      connection.customerAccounts[0]
    if (!property) return { status: "not_connected" }

    const cacheKey = [connection.id, property.customerId, range.startDate, range.endDate].join(":")
    const cached = this.cache.get(cacheKey)
    if (cached && now.getTime() - cached.at < CACHE_MS) return cached.report

    let accessToken: string
    try {
      accessToken = await this.oauthService.resolveAccessToken(connection.id)
    } catch {
      throw new IntegrationProviderError(
        "Google Analytics needs to be reconnected.",
        "GOOGLE_ANALYTICS_RECONNECT_REQUIRED",
        false,
        409
      )
    }

    const run = (request: ReportRequest) =>
      this.runReport(property.customerId, accessToken, request)
    const current = [range]
    const [totals, daily, pages, channels, sources, countries, devices, events] = await Promise.all(
      [
        run({
          dateRanges: [
            { ...range, name: "current" },
            { ...previousRange, name: "previous" },
          ],
          metrics: [
            "activeUsers",
            "newUsers",
            "sessions",
            "screenPageViews",
            "engagementRate",
            "averageSessionDuration",
            "keyEvents",
          ],
        }),
        run({
          dateRanges: current,
          dimensions: ["date"],
          metrics: ["activeUsers", "sessions", "screenPageViews"],
          orderBy: { dimension: "date" },
          limit: MAX_RANGE_DAYS,
        }),
        run({
          dateRanges: current,
          dimensions: ["pagePath"],
          metrics: ["screenPageViews", "activeUsers"],
          orderBy: { metric: "screenPageViews" },
          limit: 10,
        }),
        run({
          dateRanges: current,
          dimensions: ["sessionDefaultChannelGroup"],
          metrics: ["sessions"],
          orderBy: { metric: "sessions" },
          limit: 10,
        }),
        run({
          dateRanges: current,
          dimensions: ["sessionSource", "sessionMedium"],
          metrics: ["sessions", "activeUsers"],
          orderBy: { metric: "sessions" },
          limit: 10,
        }),
        run({
          dateRanges: current,
          dimensions: ["country", "countryId"],
          metrics: ["activeUsers"],
          orderBy: { metric: "activeUsers" },
          limit: 10,
        }),
        run({
          dateRanges: current,
          dimensions: ["deviceCategory"],
          metrics: ["activeUsers"],
          orderBy: { metric: "activeUsers" },
          limit: 5,
        }),
        run({
          dateRanges: current,
          dimensions: ["eventName"],
          metrics: ["eventCount"],
          orderBy: { metric: "eventCount" },
          limit: 10,
        }),
      ]
    )

    // With two date ranges GA4 adds a "dateRange" column naming the range each row belongs to
    // (the name given above, or date_range_0 / date_range_1); a range with no visits has no row.
    const isPrevious = (row: Record<string, string>) =>
      row.dateRange === "previous" || row.dateRange === "date_range_1"

    const report: GoogleAnalyticsInsightsReport = {
      status: "ready",
      property: { id: property.customerId, name: property.displayName ?? property.customerId },
      range,
      previousRange,
      totals: totalsFromRow(totals.find((row) => !isPrevious(row))),
      previousTotals: totalsFromRow(totals.find(isPrevious)),
      daily: daily.map((row) => ({
        date: fromGaDate(row.date ?? ""),
        users: toNumber(row.activeUsers),
        sessions: toNumber(row.sessions),
        pageViews: toNumber(row.screenPageViews),
      })),
      pages: pages.map((row) => ({
        path: row.pagePath ?? "",
        pageViews: toNumber(row.screenPageViews),
        users: toNumber(row.activeUsers),
      })),
      channels: channels.map((row) => ({
        channel: row.sessionDefaultChannelGroup ?? "",
        sessions: toNumber(row.sessions),
      })),
      sources: sources.map((row) => ({
        source: row.sessionSource ?? "",
        medium: row.sessionMedium ?? "",
        sessions: toNumber(row.sessions),
        users: toNumber(row.activeUsers),
      })),
      countries: countries.map((row) => ({
        country: row.country ?? "",
        countryCode: /^[A-Z]{2}$/.test(row.countryId ?? "") ? (row.countryId as string) : null,
        users: toNumber(row.activeUsers),
      })),
      devices: devices.map((row) => ({
        device: row.deviceCategory ?? "",
        users: toNumber(row.activeUsers),
      })),
      events: events.map((row) => ({
        name: row.eventName ?? "",
        count: toNumber(row.eventCount),
      })),
      fetchedAt: now.toISOString(),
    }

    this.remember(cacheKey, report, now)
    return report
  }

  private remember(key: string, report: GoogleAnalyticsInsightsReport, now: Date) {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      for (const [entryKey, entry] of this.cache) {
        if (now.getTime() - entry.at >= CACHE_MS) this.cache.delete(entryKey)
      }
      if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.clear()
    }
    this.cache.set(key, { at: now.getTime(), report })
  }

  // One GA4 runReport query; each row comes back as { [dimension or metric name]: value }.
  private async runReport(
    propertyId: string,
    accessToken: string,
    request: ReportRequest
  ): Promise<Array<Record<string, string>>> {
    const orderBy = request.orderBy
    const response = await fetch(`${this.dataApiBaseUrl}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        dateRanges: request.dateRanges,
        dimensions: (request.dimensions ?? []).map((name) => ({ name })),
        metrics: request.metrics.map((name) => ({ name })),
        ...(orderBy
          ? {
              orderBys: [
                "metric" in orderBy
                  ? { metric: { metricName: orderBy.metric }, desc: true }
                  : { dimension: { dimensionName: orderBy.dimension } },
              ],
            }
          : {}),
        ...(request.limit ? { limit: String(request.limit) } : {}),
      }),
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new IntegrationProviderError(
          "Google Analytics no longer lets Madar read this property.",
          "GOOGLE_ANALYTICS_RECONNECT_REQUIRED",
          false,
          409
        )
      }
      if (response.status === 429) {
        throw new IntegrationProviderError(
          "Google Analytics is limiting requests for this property. Try again later.",
          "GOOGLE_ANALYTICS_QUOTA_EXCEEDED",
          true,
          429
        )
      }
      throw new IntegrationProviderError(
        "Google Analytics didn't answer the report request.",
        "GOOGLE_ANALYTICS_REPORT_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as Ga4RunReportResponse
    const dimensionNames = (body.dimensionHeaders ?? []).map((header) => header.name)
    const metricNames = (body.metricHeaders ?? []).map((header) => header.name)
    return (body.rows ?? []).map((row) => {
      const zipped: Record<string, string> = {}
      dimensionNames.forEach((name, index) => {
        zipped[name] = row.dimensionValues?.[index]?.value ?? ""
      })
      metricNames.forEach((name, index) => {
        zipped[name] = row.metricValues?.[index]?.value ?? ""
      })
      return zipped
    })
  }
}
