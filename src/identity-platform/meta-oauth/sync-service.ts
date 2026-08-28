import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type {
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../integrations/provider-contracts"
import { IntegrationProviderError } from "../integrations/provider-error"
import { MetaGraphApiClient } from "../meta-ads/client"
import { toMetaAdsError, type MetaGraphApiErrorEnvelope } from "../meta-ads/errors"

import type { MetaOAuthRepository } from "./repository"
import type { MetaOAuthService } from "./service"
import { MetaSyncRepository, type MetaSyncRecordInput } from "./sync-repository"

const META_GRAPH_API_VERSION = "v21.0"
const DEFAULT_META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`
// actions/action_values are arrays of {action_type, value} -- needed for conversions/revenue
// and the addToCart/checkoutStarted/purchases/purchaseValue funnel fields (reduced at query
// time by the Campaigns aggregation service, not here -- this layer just stores the raw
// payload, matching every other connector's "sync stores raw, aggregation interprets"
// convention). reach/frequency/video_thruplay_watched_actions/video_play_actions cover the
// approved Meta vanity metrics (reach/frequency/ThruPlays). adset_id/ad_id let the same
// field set be reused at every insights granularity below.
const INSIGHTS_FIELDS =
  "campaign_id,campaign_name,adset_id,ad_id,impressions,clicks,spend,date_start,date_stop," +
  "reach,frequency,actions,action_values,video_thruplay_watched_actions,video_play_actions"

interface MetaCampaignApiRow {
  id: string
  name?: string
  status?: string
  objective?: string
  daily_budget?: string
  lifetime_budget?: string
  created_time?: string
  updated_time?: string
  [key: string]: unknown
}

interface MetaAdsetApiRow {
  id: string
  name?: string
  status?: string
  campaign_id?: string
  daily_budget?: string
  lifetime_budget?: string
  created_time?: string
  updated_time?: string
  [key: string]: unknown
}

interface MetaAdApiRow {
  id: string
  name?: string
  status?: string
  campaign_id?: string
  adset_id?: string
  created_time?: string
  updated_time?: string
  [key: string]: unknown
}

interface MetaInsightsApiRow {
  campaign_id: string
  campaign_name?: string
  adset_id?: string
  ad_id?: string
  impressions?: string
  clicks?: string
  spend?: string
  date_start: string
  date_stop?: string
  [key: string]: unknown
}

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IntegrationProviderError("Forbidden.", "META_SYNC_FORBIDDEN", false, 403)
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

// Raises the client's own MetaApiErrorDetail (already classified into a likelyCause/
// retryable) into a thrown MetaAdsIntegrationError -- reuses the same real error mapping
// diagnostics.ts uses, instead of hand-rolling a new generic sync error code.
function throwOnMetaFailure(error: {
  endpoint: string
  httpStatus: number
  metaErrorCode: number | null
  errorSubcode: number | null
  errorMessage: string
  fbtraceId: string | null
}): never {
  const envelope: MetaGraphApiErrorEnvelope = {
    message: error.errorMessage,
    code: error.metaErrorCode ?? undefined,
    error_subcode: error.errorSubcode ?? undefined,
    fbtrace_id: error.fbtraceId ?? undefined,
  }
  throw toMetaAdsError({ endpoint: error.endpoint, httpStatus: error.httpStatus, envelope })
}

export class MetaSyncService {
  private readonly graphApiBaseUrl: string

  constructor(
    private readonly oauthRepository: MetaOAuthRepository,
    private readonly syncRepository: MetaSyncRepository,
    private readonly oauthService: MetaOAuthService,
    config?: { graphApiBaseUrl?: string }
  ) {
    this.graphApiBaseUrl =
      config?.graphApiBaseUrl ??
      process.env.IDENTITY_PLATFORM_META_GRAPH_API_BASE_URL ??
      DEFAULT_META_GRAPH_API_BASE_URL
  }

  private async findOwnedConnectedConnection(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.oauthRepository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Meta connection not found.",
        "META_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Meta connection not found.",
        "META_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Meta connection is not connected.",
        "META_CONNECTION_NOT_READY",
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
        "Meta ad account is not accessible for this connection.",
        "META_INVALID_ACCOUNT",
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
    // cached result without re-fetching from Meta, matching Salla's sync() semantics.
    if (syncRun.status === "completed") {
      return syncRun
    }

    await this.syncRepository.markSyncRunRunning(syncRun.id, actor.userId)

    try {
      const accessToken = await this.oauthService.resolveAccessToken(connection.id)
      const client = new MetaGraphApiClient(accessToken, {
        apiBaseUrl: this.graphApiBaseUrl,
        maxRetries: 2,
        minRequestIntervalMs: 100,
      })

      // input.customerId is Meta's own act_-prefixed ad account id, stored exactly as
      // discovered from /me/adaccounts -- no prefix manipulation needed.
      const accountId = input.customerId

      // 5 concurrent calls per sync instead of 3 (campaigns/ads/campaign-insights ->
      // + adsets + adset-insights + ad-insights). Kept as separate `level` calls rather than
      // combined via Meta's `breakdowns` param -- the straightforward approach, safe to
      // optimize later if sync duration becomes an issue.
      const [
        campaignsResult,
        adsetsResult,
        adsResult,
        insightsResult,
        adsetInsightsResult,
        adInsightsResult,
      ] = await Promise.all([
        client.getAllPages<MetaCampaignApiRow>(`/${accountId}/campaigns`, {
          fields: "id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time",
        }),
        client.getAllPages<MetaAdsetApiRow>(`/${accountId}/adsets`, {
          fields:
            "id,name,status,campaign_id,daily_budget,lifetime_budget,created_time,updated_time",
        }),
        client.getAllPages<MetaAdApiRow>(`/${accountId}/ads`, {
          fields: "id,name,status,campaign_id,adset_id,created_time,updated_time",
        }),
        client.getAllPages<MetaInsightsApiRow>(`/${accountId}/insights`, {
          level: "campaign",
          date_preset: "maximum",
          fields: INSIGHTS_FIELDS,
        }),
        client.getAllPages<MetaInsightsApiRow>(`/${accountId}/insights`, {
          level: "adset",
          date_preset: "maximum",
          fields: INSIGHTS_FIELDS,
        }),
        client.getAllPages<MetaInsightsApiRow>(`/${accountId}/insights`, {
          level: "ad",
          date_preset: "maximum",
          fields: INSIGHTS_FIELDS,
        }),
      ])

      if (!campaignsResult.ok) throwOnMetaFailure(campaignsResult.error)
      if (!adsetsResult.ok) throwOnMetaFailure(adsetsResult.error)
      if (!adsResult.ok) throwOnMetaFailure(adsResult.error)
      if (!insightsResult.ok) throwOnMetaFailure(insightsResult.error)
      if (!adsetInsightsResult.ok) throwOnMetaFailure(adsetInsightsResult.error)
      if (!adInsightsResult.ok) throwOnMetaFailure(adInsightsResult.error)

      const campaigns = campaignsResult.data
      const adsets = adsetsResult.data
      const ads = adsResult.data
      const insights = insightsResult.data
      const adsetInsights = adsetInsightsResult.data
      const adInsights = adInsightsResult.data

      const records: MetaSyncRecordInput[] = [
        ...campaigns.map((campaign) => ({
          entityType: "campaigns" as const,
          entityId: String(campaign.id),
          recordDate: toRecordDate([campaign.updated_time, campaign.created_time]),
          payload: campaign as Record<string, unknown>,
        })),
        ...adsets.map((adset) => ({
          entityType: "adsets" as const,
          entityId: String(adset.id),
          recordDate: toRecordDate([adset.updated_time, adset.created_time]),
          payload: adset as Record<string, unknown>,
        })),
        ...ads.map((ad) => ({
          entityType: "ads" as const,
          entityId: String(ad.id),
          recordDate: toRecordDate([ad.updated_time, ad.created_time]),
          payload: ad as Record<string, unknown>,
        })),
        ...insights.map((row) => ({
          entityType: "insights" as const,
          entityId: `${row.campaign_id}:${row.date_start}`,
          recordDate: toRecordDate([row.date_start]),
          payload: row as Record<string, unknown>,
        })),
        ...adsetInsights.map((row) => ({
          entityType: "adset_insights" as const,
          entityId: `${row.adset_id}:${row.date_start}`,
          recordDate: toRecordDate([row.date_start]),
          payload: row as Record<string, unknown>,
        })),
        ...adInsights.map((row) => ({
          entityType: "ad_insights" as const,
          entityId: `${row.ad_id}:${row.date_start}`,
          recordDate: toRecordDate([row.date_start]),
          payload: row as Record<string, unknown>,
        })),
      ]

      const totalWritten = await this.syncRepository.upsertRecords({
        connectionId: connection.id,
        customerId: input.customerId,
        records,
      })

      const metrics = {
        campaigns: campaigns.length,
        adsets: adsets.length,
        ads: ads.length,
        insights: insights.length,
        adsetInsights: adsetInsights.length,
        adInsights: adInsights.length,
        totalRecords: totalWritten,
      }

      await this.syncRepository.markSyncRunCompleted(syncRun.id, actor.userId, metrics)

      const completed = await this.syncRepository.findSyncRunById(syncRun.id)
      if (!completed) {
        throw new IntegrationProviderError(
          "Sync run not found after completion.",
          "META_SYNC_FAILED",
          false,
          500
        )
      }
      return completed
    } catch (error) {
      const errorCode = error instanceof IntegrationProviderError ? error.code : "META_SYNC_FAILED"
      const errorMessage = error instanceof Error ? error.message : "Meta sync failed."
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
