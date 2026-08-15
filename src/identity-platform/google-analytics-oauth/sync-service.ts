import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type {
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../integrations/provider-contracts"
import { IntegrationProviderError } from "../integrations/provider-error"

import type { GoogleAnalyticsOAuthRepository } from "./repository"
import type { GoogleAnalyticsOAuthService } from "./service"
import {
  GoogleAnalyticsSyncRepository,
  type GoogleAnalyticsSyncRecordInput,
} from "./sync-repository"

const DEFAULT_GA4_DATA_API_BASE_URL = "https://analyticsdata.googleapis.com/v1beta"
// Full-history report window, anchored just past the Data API's own hard floor (confirmed
// against the live API: "start_date = 2015-01-01 must be greater than 2015-08-13") -- matches
// this session's explicit "sync everything for now, incremental comes later" scope decision.
// Unlike Snapchat's Stats API, runReport has no interval-length limit, so this is a single
// query covering the full range rather than something that needs chunking.
const REPORT_START_DATE = "2015-08-14"
const REPORT_LIMIT = 10000
// GA4 properties can have years of daily rows -- this bounds a single report's pagination so
// a misbehaving API (rowCount that never drops below the requested limit) can't loop forever.
const MAX_PAGES_PER_REPORT = 200

interface Ga4RunReportResponse {
  dimensionHeaders?: Array<{ name: string }>
  metricHeaders?: Array<{ name: string }>
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>
  rowCount?: number
}

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IntegrationProviderError("Forbidden.", "GOOGLE_ANALYTICS_SYNC_FORBIDDEN", false, 403)
  }
}

// GA4's "date" dimension returns YYYYMMDD with no separators -- normalize to YYYY-MM-DD for
// both the stored record_date column and entity_id composition.
function toIsoDate(ga4Date: string): string {
  if (/^\d{8}$/.test(ga4Date)) {
    return `${ga4Date.slice(0, 4)}-${ga4Date.slice(4, 6)}-${ga4Date.slice(6, 8)}`
  }
  const parsed = new Date(ga4Date)
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsed.toISOString().slice(0, 10)
}

// Runs a GA4 Data API runReport query to completion, paginating via limit/offset (GA4's rows
// are positional arrays keyed by dimensionHeaders/metricHeaders, not named fields -- this
// zips each row into a plain { [dimensionName]: value, [metricName]: value } object).
async function runReportAllPages(input: {
  dataApiBaseUrl: string
  propertyId: string
  accessToken: string
  dimensions: string[]
  metrics: string[]
}): Promise<Array<Record<string, string>>> {
  const results: Array<Record<string, string>> = []
  let offset = 0

  for (let page = 0; page < MAX_PAGES_PER_REPORT; page += 1) {
    const url = `${input.dataApiBaseUrl.replace(/\/$/, "")}/properties/${input.propertyId}:runReport`
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: REPORT_START_DATE, endDate: "today" }],
        dimensions: input.dimensions.map((name) => ({ name })),
        metrics: input.metrics.map((name) => ({ name })),
        limit: String(REPORT_LIMIT),
        offset: String(offset),
      }),
    })

    if (!response.ok) {
      throw new IntegrationProviderError(
        "Google Analytics API request failed during sync.",
        "GOOGLE_ANALYTICS_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as Ga4RunReportResponse
    const dimensionNames = (body.dimensionHeaders ?? []).map((header) => header.name)
    const metricNames = (body.metricHeaders ?? []).map((header) => header.name)
    const rows = body.rows ?? []

    for (const row of rows) {
      const zipped: Record<string, string> = {}
      dimensionNames.forEach((name, index) => {
        zipped[name] = row.dimensionValues?.[index]?.value ?? ""
      })
      metricNames.forEach((name, index) => {
        zipped[name] = row.metricValues?.[index]?.value ?? ""
      })
      results.push(zipped)
    }

    offset += rows.length
    // rowCount is GA4's authoritative "total matching rows, ignoring pagination" field --
    // more reliable than comparing this page's row count against the requested limit, since
    // a server is free to return fewer rows than requested even when more remain.
    const totalRows = body.rowCount ?? results.length
    if (rows.length === 0 || offset >= totalRows) {
      break
    }
  }

  return results
}

export class GoogleAnalyticsSyncService {
  private readonly dataApiBaseUrl: string

  constructor(
    private readonly oauthRepository: GoogleAnalyticsOAuthRepository,
    private readonly syncRepository: GoogleAnalyticsSyncRepository,
    private readonly oauthService: GoogleAnalyticsOAuthService,
    config?: { dataApiBaseUrl?: string }
  ) {
    this.dataApiBaseUrl =
      config?.dataApiBaseUrl ??
      process.env.GOOGLE_ANALYTICS_DATA_API_BASE_URL ??
      DEFAULT_GA4_DATA_API_BASE_URL
  }

  private async findOwnedConnectedConnection(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.oauthRepository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Google Analytics connection not found.",
        "GOOGLE_ANALYTICS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Google Analytics connection not found.",
        "GOOGLE_ANALYTICS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Google Analytics connection is not connected.",
        "GOOGLE_ANALYTICS_CONNECTION_NOT_READY",
        false,
        409
      )
    }
    return connection
  }

  private async requireAccessibleProperty(connectionId: string, customerId: string) {
    const property = await this.oauthRepository.findAccessibleCustomerAccount(
      connectionId,
      customerId
    )
    if (!property) {
      throw new IntegrationProviderError(
        "Google Analytics property is not accessible for this connection.",
        "GOOGLE_ANALYTICS_INVALID_ACCOUNT",
        false,
        400
      )
    }
    return property
  }

  async sync(actor: AuthenticatedActor, input: IntegrationProviderSyncInput) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectedConnection(actor, input.connectionId)
    await this.requireAccessibleProperty(connection.id, input.customerId)

    const syncRun = await this.syncRepository.createOrLoadSyncRun({
      connectionId: connection.id,
      organizationId: connection.organizationId,
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      customerId: input.customerId,
      startDate: input.startDate,
      endDate: input.endDate,
      idempotencyKey: input.idempotencyKey,
      actorUserId: actor.userId,
    })

    // Idempotent replay: the same idempotencyKey for an already-completed run returns the
    // cached result without re-fetching from Google Analytics, matching Salla's sync() semantics.
    if (syncRun.status === "completed") {
      return syncRun
    }

    await this.syncRepository.markSyncRunRunning(syncRun.id, actor.userId)

    try {
      const accessToken = await this.oauthService.resolveAccessToken(connection.id)
      const propertyId = input.customerId

      const [traffic, events, conversions] = await Promise.all([
        runReportAllPages({
          dataApiBaseUrl: this.dataApiBaseUrl,
          propertyId,
          accessToken,
          dimensions: ["date"],
          metrics: ["sessions", "activeUsers", "screenPageViews", "engagementRate"],
        }),
        runReportAllPages({
          dataApiBaseUrl: this.dataApiBaseUrl,
          propertyId,
          accessToken,
          dimensions: ["date", "eventName"],
          metrics: ["eventCount"],
        }),
        runReportAllPages({
          dataApiBaseUrl: this.dataApiBaseUrl,
          propertyId,
          accessToken,
          dimensions: ["date", "eventName"],
          metrics: ["conversions"],
        }),
      ])

      const records: GoogleAnalyticsSyncRecordInput[] = [
        ...traffic.map((row) => ({
          entityType: "traffic" as const,
          entityId: toIsoDate(row.date ?? ""),
          recordDate: toIsoDate(row.date ?? ""),
          payload: row as Record<string, unknown>,
        })),
        ...events.map((row) => ({
          entityType: "events" as const,
          entityId: `${toIsoDate(row.date ?? "")}:${row.eventName ?? "unknown"}`,
          recordDate: toIsoDate(row.date ?? ""),
          payload: row as Record<string, unknown>,
        })),
        ...conversions.map((row) => ({
          entityType: "conversions" as const,
          entityId: `${toIsoDate(row.date ?? "")}:${row.eventName ?? "unknown"}`,
          recordDate: toIsoDate(row.date ?? ""),
          payload: row as Record<string, unknown>,
        })),
      ]

      const totalWritten = await this.syncRepository.upsertRecords({
        connectionId: connection.id,
        customerId: input.customerId,
        records,
      })

      const metrics = {
        traffic: traffic.length,
        events: events.length,
        conversions: conversions.length,
        totalRecords: totalWritten,
      }

      await this.syncRepository.markSyncRunCompleted(syncRun.id, actor.userId, metrics)

      const completed = await this.syncRepository.findSyncRunById(syncRun.id)
      if (!completed) {
        throw new IntegrationProviderError(
          "Sync run not found after completion.",
          "GOOGLE_ANALYTICS_SYNC_FAILED",
          false,
          500
        )
      }
      return completed
    } catch (error) {
      const errorCode =
        error instanceof IntegrationProviderError ? error.code : "GOOGLE_ANALYTICS_SYNC_FAILED"
      const errorMessage = error instanceof Error ? error.message : "Google Analytics sync failed."
      await this.syncRepository.markSyncRunFailed(syncRun.id, actor.userId, errorCode, errorMessage)
      throw error
    }
  }

  async listRecords(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery) {
    // Viewing synced records doesn't require the owner/admin role that mutating the
    // connection does -- matches every other connector's listRecords.
    const connection = await this.findOwnedConnectedConnection(actor, query.connectionId)
    await this.requireAccessibleProperty(connection.id, query.customerId)

    return this.syncRepository.listRecords(query)
  }
}
