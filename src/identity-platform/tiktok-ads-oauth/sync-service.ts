import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type {
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../integrations/provider-contracts"
import { IntegrationProviderError } from "../integrations/provider-error"

import type { TikTokAdsOAuthRepository } from "./repository"
import type { TikTokAdsOAuthService } from "./service"
import { TikTokAdsSyncRepository, type TikTokAdsSyncRecordInput } from "./sync-repository"

const DEFAULT_TIKTOK_ADS_API_BASE_URL = "https://business-api.tiktok.com/open_api/v1.3"
// TikTok advertisers can have thousands of campaigns/ad groups/ads/report rows -- this bounds
// a single sync run so a misbehaving API (e.g. pagination metadata that never signals "done")
// can't loop forever, matching every other connector's MAX_PAGES_PER_ENTITY guard.
const MAX_PAGES_PER_ENTITY = 200
const LIST_PAGE_SIZE = 100
const INSIGHTS_PAGE_SIZE = 100
// "Full history" for the reporting entity -- there's no natural start date for ad performance
// (campaigns/ad groups/ads aren't date-bounded at all). TikTok Ads Manager itself only
// launched around 2019, so anchoring there (rather than the 2015 placeholder other
// connectors use) keeps the number of mostly-empty date windows walked below reasonable.
const INSIGHTS_START_DATE = "2019-01-01"
// Confirmed live against TikTok's API (error code 40002): "max time span is 30 days when use
// stat_time_day" -- report/integrated/get hard-rejects any single request spanning more than
// 30 days when the stat_time_day dimension is present, unlike every other connector's report
// endpoint (Meta's date_preset=maximum, Snapchat/GA4's single wide start/end) which handle
// large ranges server-side. So "full history" here has to be walked as successive 30-day
// windows, not requested in one shot.
const INSIGHTS_WINDOW_DAYS = 30
const MAX_INSIGHTS_WINDOWS = 100
// Walking up to 100 windows one-at-a-time (await in a loop) made a real sync exceed the
// frontend's request timeout in production -- each window is an independent request (its own
// date range, no shared pagination cursor), so there's no ordering requirement forcing them to
// run sequentially. 5 is conservative against TikTok's "Basic" rate-limiting tier (confirmed
// via the app's own Partner Dashboard -- no published fixed-number limit that would call for a
// higher or lower value), the same caution used for Meta's own client rate limiter elsewhere
// in this codebase.
const INSIGHTS_WINDOW_CONCURRENCY = 5
// Same reasoning as INSIGHTS_WINDOW_CONCURRENCY, applied to walking campaign/adgroup/ad list
// pages once page 1 reveals how many pages there actually are.
const LIST_PAGE_CONCURRENCY = 5

interface TikTokAdsApiEnvelope<T> {
  code: number
  message?: string
  data?: {
    list?: T[]
    page_info?: { page?: number; page_size?: number; total_number?: number; total_page?: number }
  }
}

interface TikTokAdsCampaignRow {
  campaign_id: string
  campaign_name?: string
  operation_status?: string
  objective_type?: string
  budget?: number
  create_time?: string
  modify_time?: string
  [key: string]: unknown
}

interface TikTokAdsAdgroupRow {
  adgroup_id: string
  adgroup_name?: string
  campaign_id?: string
  operation_status?: string
  budget?: number
  create_time?: string
  modify_time?: string
  [key: string]: unknown
}

interface TikTokAdsAdRow {
  ad_id: string
  ad_name?: string
  adgroup_id?: string
  campaign_id?: string
  operation_status?: string
  create_time?: string
  modify_time?: string
  [key: string]: unknown
}

interface TikTokAdsInsightRow {
  dimensions: { campaign_id?: string; stat_time_day?: string; [key: string]: unknown }
  metrics: Record<string, unknown>
}

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IntegrationProviderError("Forbidden.", "TIKTOK_ADS_SYNC_FORBIDDEN", false, 403)
  }
}

// Diagnostic messages must never leak the access token, only status/response shape --
// TikTok's error responses put the human-readable reason in `message` (and sometimes
// `data.description`), which the previous version of this file discarded entirely, leaving
// only a generic "API request failed" in logs with no way to tell a bad parameter from a
// scope issue from a rate limit.
async function describeTikTokFailure(
  response: Response,
  parsedBody?: TikTokAdsApiEnvelope<unknown>
): Promise<string> {
  if (parsedBody) {
    return `status=${response.status} code=${parsedBody.code} message=${parsedBody.message ?? "(none)"}`
  }
  const text = await response.text().catch(() => "(unreadable body)")
  return `status=${response.status} body=${text.slice(0, 500)}`
}

function toRecordDate(candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue
    const parsed = new Date(candidate)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }
  return new Date().toISOString().slice(0, 10)
}

// Confirmed against TikTok's Business API SDK docs (CampaignCreationApi/AdgroupApi/AdApi):
// campaign/get, adgroup/get, and ad/get all share the same page/page_size pagination and
// {data: {list, page_info: {total_page}}} envelope -- one generic fetcher covers all three
// levels of the account hierarchy.
async function fetchListPage<T>(input: {
  apiBaseUrl: string
  path: string
  advertiserId: string
  accessToken: string
  page: number
}): Promise<{ items: T[]; totalPage: number | undefined }> {
  const url = new URL(`${input.apiBaseUrl.replace(/\/$/, "")}${input.path}`)
  url.searchParams.set("advertiser_id", input.advertiserId)
  url.searchParams.set("page", String(input.page))
  url.searchParams.set("page_size", String(LIST_PAGE_SIZE))

  const response = await fetch(url.toString(), {
    headers: {
      "access-token": input.accessToken,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new IntegrationProviderError(
      `TikTok Ads API request failed during sync (${input.path}): ${await describeTikTokFailure(response)}`,
      "TIKTOK_ADS_SYNC_API_REQUEST_FAILED",
      true,
      502
    )
  }

  const body = (await response.json()) as TikTokAdsApiEnvelope<T>
  if (body.code !== 0) {
    throw new IntegrationProviderError(
      `TikTok Ads API request failed during sync (${input.path}): ${await describeTikTokFailure(response, body)}`,
      "TIKTOK_ADS_SYNC_API_REQUEST_FAILED",
      true,
      502
    )
  }

  return { items: body.data?.list ?? [], totalPage: body.data?.page_info?.total_page }
}

// Fetches page 1 first to learn total_page from the response, then fetches every remaining
// page concurrently instead of walking them one at a time -- an account with thousands of
// campaigns/ad groups/ads (real scale once MADAR has real clients, not just this dev store)
// would otherwise take one full network round-trip per page in sequence.
async function fetchAllListPages<T>(input: {
  apiBaseUrl: string
  path: string
  advertiserId: string
  accessToken: string
}): Promise<T[]> {
  const first = await fetchListPage<T>({ ...input, page: 1 })

  const totalPage = first.totalPage
  const cappedTotalPage =
    typeof totalPage === "number"
      ? Math.min(totalPage, MAX_PAGES_PER_ENTITY)
      : first.items.length < LIST_PAGE_SIZE
        ? 1
        : MAX_PAGES_PER_ENTITY

  if (cappedTotalPage <= 1) {
    return first.items
  }

  const remainingPages = Array.from({ length: cappedTotalPage - 1 }, (_, i) => i + 2)
  const remainingResults = await mapWithConcurrency(remainingPages, LIST_PAGE_CONCURRENCY, (page) =>
    fetchListPage<T>({ ...input, page })
  )

  const items = [first.items]
  for (const result of remainingResults) {
    items.push(result.items)
    // A page_info-less API (or one whose total_page undercounts) could otherwise keep this
    // walking forever -- stop as soon as a page comes back short, same guard the original
    // sequential version relied on.
    if (result.items.length < LIST_PAGE_SIZE) {
      break
    }
  }

  return items.flat()
}

function toDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Fetches one 30-day (or narrower, for the final trailing window) slice of daily campaign
// performance, paginating within that slice the same way campaign/adgroup/ad do.
async function fetchInsightsWindow(input: {
  apiBaseUrl: string
  advertiserId: string
  accessToken: string
  startDate: string
  endDate: string
}): Promise<TikTokAdsInsightRow[]> {
  const results: TikTokAdsInsightRow[] = []
  let page = 1

  while (page <= MAX_PAGES_PER_ENTITY) {
    const url = new URL(`${input.apiBaseUrl.replace(/\/$/, "")}/report/integrated/get/`)
    url.searchParams.set("advertiser_id", input.advertiserId)
    url.searchParams.set("report_type", "BASIC")
    url.searchParams.set("data_level", "AUCTION_CAMPAIGN")
    url.searchParams.set("dimensions", JSON.stringify(["campaign_id", "stat_time_day"]))
    url.searchParams.set(
      "metrics",
      JSON.stringify(["spend", "impressions", "clicks", "ctr", "conversion"])
    )
    url.searchParams.set("start_date", input.startDate)
    url.searchParams.set("end_date", input.endDate)
    url.searchParams.set("page", String(page))
    url.searchParams.set("page_size", String(INSIGHTS_PAGE_SIZE))

    const response = await fetch(url.toString(), {
      headers: {
        "access-token": input.accessToken,
        accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new IntegrationProviderError(
        `TikTok Ads API request failed during sync (report/integrated/get, ${input.startDate}..${input.endDate}): ${await describeTikTokFailure(response)}`,
        "TIKTOK_ADS_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as TikTokAdsApiEnvelope<TikTokAdsInsightRow>
    if (body.code !== 0) {
      throw new IntegrationProviderError(
        `TikTok Ads API request failed during sync (report/integrated/get, ${input.startDate}..${input.endDate}): ${await describeTikTokFailure(response, body)}`,
        "TIKTOK_ADS_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const items = body.data?.list ?? []
    results.push(...items)

    const totalPage = body.data?.page_info?.total_page
    const doneByTotalPage = typeof totalPage === "number" && page >= totalPage
    const doneByShortPage = items.length === 0 || items.length < INSIGHTS_PAGE_SIZE

    if (doneByTotalPage || doneByShortPage) {
      break
    }

    page += 1
  }

  return results
}

function buildInsightsWindows(): Array<{ startDate: string; endDate: string }> {
  const windows: Array<{ startDate: string; endDate: string }> = []
  const today = new Date()
  let windowStart = new Date(`${INSIGHTS_START_DATE}T00:00:00Z`)

  while (windowStart <= today && windows.length < MAX_INSIGHTS_WINDOWS) {
    const windowEndMs = Math.min(
      windowStart.getTime() + (INSIGHTS_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000,
      today.getTime()
    )
    const windowEnd = new Date(windowEndMs)
    windows.push({ startDate: toDateStamp(windowStart), endDate: toDateStamp(windowEnd) })
    windowStart = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000)
  }

  return windows
}

// Each window is an independent request (its own date range, no shared pagination cursor
// carried between them), so there's no ordering requirement forcing them to run one-at-a-time
// -- running them with bounded concurrency instead of a sequential await-in-loop is what keeps
// a full-history sync (up to MAX_INSIGHTS_WINDOWS windows) inside the frontend's request
// timeout, and keeps scaling to accounts with years of history as MADAR gets real clients.
async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let nextIndex = 0

  async function runNext(): Promise<void> {
    const index = nextIndex
    nextIndex += 1
    if (index >= items.length) {
      return
    }
    results[index] = await worker(items[index])
    return runNext()
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()))
  return results
}

// Walks "full history" as successive INSIGHTS_WINDOW_DAYS-day slices from INSIGHTS_START_DATE
// through today -- see the MAX_INSIGHTS_WINDOWS comment for why a single request can't cover
// the whole range.
async function fetchAllInsights(input: {
  apiBaseUrl: string
  advertiserId: string
  accessToken: string
}): Promise<TikTokAdsInsightRow[]> {
  const windows = buildInsightsWindows()

  const windowResults = await mapWithConcurrency(windows, INSIGHTS_WINDOW_CONCURRENCY, (window) =>
    fetchInsightsWindow({
      apiBaseUrl: input.apiBaseUrl,
      advertiserId: input.advertiserId,
      accessToken: input.accessToken,
      startDate: window.startDate,
      endDate: window.endDate,
    })
  )

  return windowResults.flat()
}

export class TikTokAdsSyncService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly oauthRepository: TikTokAdsOAuthRepository,
    private readonly syncRepository: TikTokAdsSyncRepository,
    private readonly oauthService: TikTokAdsOAuthService,
    config?: { apiBaseUrl?: string }
  ) {
    this.apiBaseUrl =
      config?.apiBaseUrl ?? process.env.TIKTOK_ADS_API_BASE_URL ?? DEFAULT_TIKTOK_ADS_API_BASE_URL
  }

  private async findOwnedConnectedConnection(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.oauthRepository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "TikTok Ads connection not found.",
        "TIKTOK_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "TikTok Ads connection not found.",
        "TIKTOK_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "TikTok Ads connection is not connected.",
        "TIKTOK_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }
    return connection
  }

  private async requireAccessibleAdvertiserAccount(connectionId: string, customerId: string) {
    const account = await this.oauthRepository.findAccessibleCustomerAccount(
      connectionId,
      customerId
    )
    if (!account) {
      throw new IntegrationProviderError(
        "TikTok Ads advertiser account is not accessible for this connection.",
        "TIKTOK_ADS_INVALID_ACCOUNT",
        false,
        400
      )
    }
    return account
  }

  async sync(actor: AuthenticatedActor, input: IntegrationProviderSyncInput) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectedConnection(actor, input.connectionId)
    await this.requireAccessibleAdvertiserAccount(connection.id, input.customerId)

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
    // cached result without re-fetching from TikTok, matching every other connector's sync()
    // semantics.
    if (syncRun.status === "completed") {
      return syncRun
    }

    await this.syncRepository.markSyncRunRunning(syncRun.id, actor.userId)

    try {
      const accessToken = await this.oauthService.resolveAccessToken(connection.id)
      const advertiserId = input.customerId

      const [campaigns, adgroups, ads, insights] = await Promise.all([
        fetchAllListPages<TikTokAdsCampaignRow>({
          apiBaseUrl: this.apiBaseUrl,
          path: "/campaign/get/",
          advertiserId,
          accessToken,
        }),
        fetchAllListPages<TikTokAdsAdgroupRow>({
          apiBaseUrl: this.apiBaseUrl,
          path: "/adgroup/get/",
          advertiserId,
          accessToken,
        }),
        fetchAllListPages<TikTokAdsAdRow>({
          apiBaseUrl: this.apiBaseUrl,
          path: "/ad/get/",
          advertiserId,
          accessToken,
        }),
        fetchAllInsights({
          apiBaseUrl: this.apiBaseUrl,
          advertiserId,
          accessToken,
        }),
      ])

      const records: TikTokAdsSyncRecordInput[] = [
        ...campaigns.map((campaign) => ({
          entityType: "campaigns" as const,
          entityId: String(campaign.campaign_id),
          recordDate: toRecordDate([campaign.modify_time, campaign.create_time]),
          payload: campaign as Record<string, unknown>,
        })),
        ...adgroups.map((adgroup) => ({
          entityType: "adgroups" as const,
          entityId: String(adgroup.adgroup_id),
          recordDate: toRecordDate([adgroup.modify_time, adgroup.create_time]),
          payload: adgroup as Record<string, unknown>,
        })),
        ...ads.map((ad) => ({
          entityType: "ads" as const,
          entityId: String(ad.ad_id),
          recordDate: toRecordDate([ad.modify_time, ad.create_time]),
          payload: ad as Record<string, unknown>,
        })),
        ...insights.map((row) => ({
          entityType: "insights" as const,
          entityId: `${row.dimensions.campaign_id}:${row.dimensions.stat_time_day}`,
          recordDate: toRecordDate([row.dimensions.stat_time_day]),
          payload: row as unknown as Record<string, unknown>,
        })),
      ]

      const totalWritten = await this.syncRepository.upsertRecords({
        connectionId: connection.id,
        customerId: input.customerId,
        records,
      })

      const metrics = {
        campaigns: campaigns.length,
        adgroups: adgroups.length,
        ads: ads.length,
        insights: insights.length,
        totalRecords: totalWritten,
      }

      await this.syncRepository.markSyncRunCompleted(syncRun.id, actor.userId, metrics)

      const completed = await this.syncRepository.findSyncRunById(syncRun.id)
      if (!completed) {
        throw new IntegrationProviderError(
          "Sync run not found after completion.",
          "TIKTOK_ADS_SYNC_FAILED",
          false,
          500
        )
      }
      return completed
    } catch (error) {
      const errorCode =
        error instanceof IntegrationProviderError ? error.code : "TIKTOK_ADS_SYNC_FAILED"
      const errorMessage = error instanceof Error ? error.message : "TikTok Ads sync failed."
      await this.syncRepository.markSyncRunFailed(syncRun.id, actor.userId, errorCode, errorMessage)
      throw error
    }
  }

  async listRecords(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery) {
    // Viewing synced records doesn't require the owner/admin role that mutating the
    // connection does -- matches every other connector's listRecords.
    const connection = await this.findOwnedConnectedConnection(actor, query.connectionId)
    await this.requireAccessibleAdvertiserAccount(connection.id, query.customerId)

    return this.syncRepository.listRecords(query)
  }
}
