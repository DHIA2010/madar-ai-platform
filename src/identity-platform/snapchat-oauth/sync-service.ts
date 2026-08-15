import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type {
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../integrations/provider-contracts"
import { IntegrationProviderError } from "../integrations/provider-error"

import type { SnapchatOAuthRepository } from "./repository"
import type { SnapchatOAuthService } from "./service"
import { SnapchatSyncRepository, type SnapchatSyncRecordInput } from "./sync-repository"

const DEFAULT_SNAPCHAT_API_BASE_URL = "https://adsapi.snapchat.com/v1"
// Snapchat ad accounts can have thousands of campaigns/ads/stats-days -- this bounds a single
// sync run so a misbehaving API (e.g. a next_link that never stops appearing) can't loop forever.
const MAX_PAGES_PER_ENTITY = 200
// Full-history stats window, anchored well before Snapchat's ad platform existed -- matches
// this session's explicit "sync everything for now, incremental comes later" scope decision.
const STATS_START_TIME = "2015-01-01T00:00:00Z"
const STATS_FIELDS = "impressions,spend,swipes"

interface SnapchatCampaignApiRow {
  id: string
  name?: string
  status?: string
  objective?: string
  daily_budget_micro?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

interface SnapchatAdApiRow {
  id: string
  name?: string
  status?: string
  ad_squad_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

interface SnapchatDailyStat {
  start_time: string
  end_time?: string
  stats?: Record<string, unknown>
  [key: string]: unknown
}

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IntegrationProviderError("Forbidden.", "SNAPCHAT_SYNC_FORBIDDEN", false, 403)
  }
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

// Snapchat's Marketing API wraps every list entry as { sub_request_status, <singular>: {...} }
// (confirmed against Snapchat's docs and against the account-discovery fix earlier this
// session) and paginates via a "paging.next_link" full URL rather than a page= parameter.
async function fetchAllPagesByNextLink<T>(input: {
  initialUrl: string
  accessToken: string
  listKey: string
  singularKey: string
}): Promise<T[]> {
  const results: T[] = []
  let url: string | null = input.initialUrl
  let pages = 0

  while (url && pages < MAX_PAGES_PER_ENTITY) {
    const response: Response = await fetch(url, {
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new IntegrationProviderError(
        "Snapchat API request failed during sync.",
        "SNAPCHAT_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as Record<string, unknown>
    const entries = Array.isArray(body[input.listKey])
      ? (body[input.listKey] as Array<Record<string, unknown>>)
      : []

    for (const entry of entries) {
      const item = entry[input.singularKey]
      if (item) {
        results.push(item as T)
      }
    }

    const paging = body.paging as { next_link?: string } | undefined
    url = paging?.next_link ?? null
    pages += 1
  }

  return results
}

export class SnapchatSyncService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly oauthRepository: SnapchatOAuthRepository,
    private readonly syncRepository: SnapchatSyncRepository,
    private readonly oauthService: SnapchatOAuthService,
    config?: { apiBaseUrl?: string }
  ) {
    this.apiBaseUrl =
      config?.apiBaseUrl ??
      process.env.SNAPCHAT_MARKETING_API_BASE_URL ??
      DEFAULT_SNAPCHAT_API_BASE_URL
  }

  private async findOwnedConnectedConnection(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.oauthRepository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Snapchat connection not found.",
        "SNAPCHAT_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Snapchat connection not found.",
        "SNAPCHAT_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Snapchat connection is not connected.",
        "SNAPCHAT_CONNECTION_NOT_READY",
        false,
        409
      )
    }
    return connection
  }

  private async requireAccessibleAdAccount(connectionId: string, customerId: string) {
    const account = await this.oauthRepository.findAccessibleCustomerAccount(
      connectionId,
      customerId
    )
    if (!account) {
      throw new IntegrationProviderError(
        "Snapchat ad account is not accessible for this connection.",
        "SNAPCHAT_INVALID_ACCOUNT",
        false,
        400
      )
    }
    return account
  }

  async sync(actor: AuthenticatedActor, input: IntegrationProviderSyncInput) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectedConnection(actor, input.connectionId)
    await this.requireAccessibleAdAccount(connection.id, input.customerId)

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
    // cached result without re-fetching from Snapchat, matching Salla's sync() semantics.
    if (syncRun.status === "completed") {
      return syncRun
    }

    await this.syncRepository.markSyncRunRunning(syncRun.id, actor.userId)

    try {
      const accessToken = await this.oauthService.resolveAccessToken(connection.id)
      const accountId = input.customerId
      const base = this.apiBaseUrl.replace(/\/$/, "")
      const nowIso = new Date().toISOString()

      const [campaigns, ads] = await Promise.all([
        fetchAllPagesByNextLink<SnapchatCampaignApiRow>({
          initialUrl: `${base}/adaccounts/${accountId}/campaigns`,
          accessToken,
          listKey: "campaigns",
          singularKey: "campaign",
        }),
        fetchAllPagesByNextLink<SnapchatAdApiRow>({
          initialUrl: `${base}/adaccounts/${accountId}/ads`,
          accessToken,
          listKey: "ads",
          singularKey: "ad",
        }),
      ])

      const statsUrl = new URL(`${base}/adaccounts/${accountId}/stats`)
      statsUrl.searchParams.set("granularity", "DAY")
      statsUrl.searchParams.set("start_time", STATS_START_TIME)
      statsUrl.searchParams.set("end_time", nowIso)
      statsUrl.searchParams.set("fields", STATS_FIELDS)

      const statsResponse = await fetch(statsUrl.toString(), {
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      })
      if (!statsResponse.ok) {
        throw new IntegrationProviderError(
          "Snapchat API request failed during sync.",
          "SNAPCHAT_SYNC_API_REQUEST_FAILED",
          true,
          502
        )
      }
      const statsBody = (await statsResponse.json()) as {
        timeseries_stats?: Array<{ timeseries_stat?: { timeseries?: SnapchatDailyStat[] } }>
      }
      const dailyStats = (statsBody.timeseries_stats ?? []).flatMap(
        (entry) => entry.timeseries_stat?.timeseries ?? []
      )

      const records: SnapchatSyncRecordInput[] = [
        ...campaigns.map((campaign) => ({
          entityType: "campaigns" as const,
          entityId: String(campaign.id),
          recordDate: toRecordDate([campaign.updated_at, campaign.created_at]),
          payload: campaign as Record<string, unknown>,
        })),
        ...ads.map((ad) => ({
          entityType: "ads" as const,
          entityId: String(ad.id),
          recordDate: toRecordDate([ad.updated_at, ad.created_at]),
          payload: ad as Record<string, unknown>,
        })),
        ...dailyStats.map((stat) => ({
          entityType: "stats" as const,
          entityId: `${accountId}:${stat.start_time}`,
          recordDate: toRecordDate([stat.start_time]),
          payload: stat as Record<string, unknown>,
        })),
      ]

      const totalWritten = await this.syncRepository.upsertRecords({
        connectionId: connection.id,
        customerId: input.customerId,
        records,
      })

      const metrics = {
        campaigns: campaigns.length,
        ads: ads.length,
        stats: dailyStats.length,
        totalRecords: totalWritten,
      }

      await this.syncRepository.markSyncRunCompleted(syncRun.id, actor.userId, metrics)

      const completed = await this.syncRepository.findSyncRunById(syncRun.id)
      if (!completed) {
        throw new IntegrationProviderError(
          "Sync run not found after completion.",
          "SNAPCHAT_SYNC_FAILED",
          false,
          500
        )
      }
      return completed
    } catch (error) {
      const errorCode =
        error instanceof IntegrationProviderError ? error.code : "SNAPCHAT_SYNC_FAILED"
      const errorMessage = error instanceof Error ? error.message : "Snapchat sync failed."
      await this.syncRepository.markSyncRunFailed(syncRun.id, actor.userId, errorCode, errorMessage)
      throw error
    }
  }

  async listRecords(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery) {
    // Viewing synced records doesn't require the owner/admin role that mutating the
    // connection does -- matches every other connector's listRecords.
    const connection = await this.findOwnedConnectedConnection(actor, query.connectionId)
    await this.requireAccessibleAdAccount(connection.id, query.customerId)

    return this.syncRepository.listRecords(query)
  }
}
