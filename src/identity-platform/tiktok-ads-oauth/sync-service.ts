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
// (campaigns/ad groups/ads aren't date-bounded at all), so this anchors well before TikTok
// Ads existed, matching the same full-history convention used for Meta/Snapchat/GA4.
const INSIGHTS_START_DATE = "2015-01-01"

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
// {data: {list, page_info: {total_page}}} envelope -- one generic walker covers all three
// levels of the account hierarchy.
async function fetchAllListPages<T>(input: {
  apiBaseUrl: string
  path: string
  advertiserId: string
  accessToken: string
}): Promise<T[]> {
  const results: T[] = []
  let page = 1

  while (page <= MAX_PAGES_PER_ENTITY) {
    const url = new URL(`${input.apiBaseUrl.replace(/\/$/, "")}${input.path}`)
    url.searchParams.set("advertiser_id", input.advertiserId)
    url.searchParams.set("page", String(page))
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

    const items = body.data?.list ?? []
    results.push(...items)

    const totalPage = body.data?.page_info?.total_page
    const doneByTotalPage = typeof totalPage === "number" && page >= totalPage
    const doneByShortPage = items.length === 0 || items.length < LIST_PAGE_SIZE

    if (doneByTotalPage || doneByShortPage) {
      break
    }

    page += 1
  }

  return results
}

// Confirmed against TikTok's report/integrated/get docs: dimensions/metrics are passed as
// JSON-encoded array query params, and each response row nests its values under
// {dimensions: {...}, metrics: {...}} instead of the flat shape campaign/adgroup/ad use.
async function fetchAllInsights(input: {
  apiBaseUrl: string
  advertiserId: string
  accessToken: string
}): Promise<TikTokAdsInsightRow[]> {
  const results: TikTokAdsInsightRow[] = []
  let page = 1
  const endDate = new Date().toISOString().slice(0, 10)

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
    url.searchParams.set("start_date", INSIGHTS_START_DATE)
    url.searchParams.set("end_date", endDate)
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
        `TikTok Ads API request failed during sync (report/integrated/get): ${await describeTikTokFailure(response)}`,
        "TIKTOK_ADS_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as TikTokAdsApiEnvelope<TikTokAdsInsightRow>
    if (body.code !== 0) {
      throw new IntegrationProviderError(
        `TikTok Ads API request failed during sync (report/integrated/get): ${await describeTikTokFailure(response, body)}`,
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
