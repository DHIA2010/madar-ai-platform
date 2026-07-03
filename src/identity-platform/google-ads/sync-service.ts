import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import { GoogleOAuthRepository } from "../google-oauth/repository"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { GoogleAdsAuthProvider } from "./auth-provider"
import { GoogleAdsClient } from "./client"
import { GoogleAdsIntegrationError } from "./errors"
import type { GoogleAdsNormalizedBundle } from "./models"
import { GoogleAdsRepository } from "./repository"
import {
  GoogleAdsAdGroupService,
  GoogleAdsAdService,
  GoogleAdsCampaignService,
  GoogleAdsCustomerService,
  GoogleAdsInsightsService,
  GoogleAdsKeywordService,
} from "./services"
import type { GoogleAdsRecordQuery, GoogleAdsSyncRequest } from "./types"

type SyncStage =
  | "customers"
  | "campaigns"
  | "campaignMetrics"
  | "adGroups"
  | "adGroupMetrics"
  | "ads"
  | "adMetrics"
  | "keywords"
  | "keywordMetrics"
  | "searchTerms"
  | "geoMetrics"
  | "deviceMetrics"
  | "conversionActions"
  | "completed"

interface SyncCheckpointState {
  version: 1
  mode: "full" | "incremental"
  stage: SyncStage
  startDate: string
  endDate: string
  counts: Record<string, number>
}

const STAGE_ORDER: SyncStage[] = [
  "customers",
  "campaigns",
  "campaignMetrics",
  "adGroups",
  "adGroupMetrics",
  "ads",
  "adMetrics",
  "keywords",
  "keywordMetrics",
  "searchTerms",
  "geoMetrics",
  "deviceMetrics",
  "conversionActions",
  "completed",
]

function createEmptyBundle(): GoogleAdsNormalizedBundle {
  return {
    customers: [],
    campaigns: [],
    campaignMetrics: [],
    adGroups: [],
    adGroupMetrics: [],
    ads: [],
    adMetrics: [],
    keywords: [],
    keywordMetrics: [],
    searchTerms: [],
    geoMetrics: [],
    deviceMetrics: [],
    conversionActions: [],
  }
}

function addDays(isoDate: string, days: number) {
  const normalized = isoDate.slice(0, 10)
  const value = new Date(`${normalized}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function mergeCounts(previous: Record<string, number>, next: Partial<Record<string, number>>) {
  return {
    ...previous,
    ...Object.fromEntries(
      Object.entries(next).map(([key, value]) => [key, value ?? previous[key] ?? 0])
    ),
  }
}

function assertAuthorized(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new GoogleAdsIntegrationError("Forbidden", "GOOGLE_ADS_FORBIDDEN", false, 403)
  }
}

function safeDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new GoogleAdsIntegrationError("Invalid date range.", "GOOGLE_ADS_SYNC_FAILED", false, 400)
  }

  return date.toISOString().slice(0, 10)
}

export class GoogleAdsSyncService {
  private readonly oauthRepository: GoogleOAuthRepository
  private readonly repository: GoogleAdsRepository
  private readonly client: GoogleAdsClient
  private readonly customerService: GoogleAdsCustomerService
  private readonly campaignService: GoogleAdsCampaignService
  private readonly adGroupService: GoogleAdsAdGroupService
  private readonly adService: GoogleAdsAdService
  private readonly keywordService: GoogleAdsKeywordService
  private readonly insightsService: GoogleAdsInsightsService

  constructor(
    private readonly db: PostgresDatabase,
    private readonly config: {
      apiBaseUrl: string
      tokenEndpoint: string
      clientId: string
      clientSecret: string
      encryptionKey: string
      developerToken: string
      loginCustomerId?: string
      maxRetries?: number
      minRequestIntervalMs?: number
    },
    fetchFn: typeof fetch = fetch
  ) {
    const authProvider = new GoogleAdsAuthProvider(db, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tokenEndpoint: config.tokenEndpoint,
      encryptionKey: config.encryptionKey,
    })

    const client = new GoogleAdsClient(
      authProvider,
      {
        apiBaseUrl: config.apiBaseUrl,
        developerToken: config.developerToken,
        loginCustomerId: config.loginCustomerId,
        maxRetries: config.maxRetries ?? 2,
        minRequestIntervalMs: config.minRequestIntervalMs ?? 75,
      },
      fetchFn
    )

    this.oauthRepository = new GoogleOAuthRepository(db)
    this.repository = new GoogleAdsRepository(db)
    this.client = client
    this.customerService = new GoogleAdsCustomerService(client)
    this.campaignService = new GoogleAdsCampaignService(client)
    this.adGroupService = new GoogleAdsAdGroupService(client)
    this.adService = new GoogleAdsAdService(client)
    this.keywordService = new GoogleAdsKeywordService(client)
    this.insightsService = new GoogleAdsInsightsService(client)
  }

  async sync(actor: AuthenticatedActor, input: GoogleAdsSyncRequest) {
    assertAuthorized(actor)

    const connection = await this.oauthRepository.findConnectionById(input.connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new GoogleAdsIntegrationError(
        "Google Ads connection not found.",
        "GOOGLE_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

    if (connection.status !== "connected") {
      throw new GoogleAdsIntegrationError(
        "Google Ads connection is not connected.",
        "GOOGLE_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const customerId = input.customerId
    const selectedCustomer = await this.resolveAccessibleCustomerAccount(
      connection.id,
      customerId,
      actor.userId
    )
    if (!selectedCustomer) {
      throw new GoogleAdsIntegrationError(
        "Google Ads customer is not accessible for this connection.",
        "GOOGLE_ADS_INVALID_CUSTOMER",
        false,
        400
      )
    }

    const startDate = safeDate(input.startDate)
    const endDate = safeDate(input.endDate)
    const providerKey = "google-ads"
    const lock = await this.repository.acquireSyncLock({
      providerKey,
      connectionId: connection.id,
      projectId: connection.projectId,
      organizationId: connection.organizationId,
      actorUserId: actor.userId,
      leaseSeconds: 3600,
    })

    if (!lock) {
      throw new GoogleAdsIntegrationError(
        "Google Ads sync is already running.",
        "GOOGLE_ADS_SYNC_IN_PROGRESS",
        true,
        409
      )
    }

    const syncRun = await this.repository.createOrLoadSyncRun({
      connectionId: connection.id,
      organizationId: connection.organizationId,
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      customerId,
      startDate,
      endDate,
      idempotencyKey: input.idempotencyKey,
      actorUserId: actor.userId,
    })

    if (syncRun.status === "completed") {
      await this.repository.releaseSyncLock({
        providerKey,
        connectionId: connection.id,
        projectId: connection.projectId,
        lockToken: lock.lockToken,
      })
      return syncRun
    }

    const checkpoint = await this.repository.loadSyncCheckpoint({
      providerKey,
      connectionId: connection.id,
      customerId,
    })
    const checkpointState = this.normalizeCheckpoint(
      checkpoint?.checkpointState,
      input.mode ?? "incremental",
      startDate,
      endDate
    )
    const resumeFromStageIndex =
      checkpoint?.status === "in_progress"
        ? Math.max(STAGE_ORDER.indexOf(checkpointState.stage) + 1, 0)
        : 0
    const effectiveStartDate =
      checkpoint?.status === "completed" && checkpoint.lastRecordDate
        ? addDays(checkpoint.lastRecordDate, 1)
        : startDate

    await this.repository.markSyncRunRunning(syncRun.id, actor.userId)

    try {
      let persistedCount = 0
      let counts = checkpointState.counts

      const persistStage = async (
        stage: Exclude<SyncStage, "completed">,
        stageBundle: GoogleAdsNormalizedBundle,
        nextCounts: Partial<Record<string, number>>
      ) => {
        await this.repository.withTransaction(async () => {
          persistedCount += await this.repository.upsertBundle({
            syncRunId: syncRun.id,
            connectionId: connection.id,
            customerId,
            bundle: stageBundle,
          })

          counts = mergeCounts(counts, nextCounts)
          await this.repository.saveSyncCheckpoint({
            providerKey,
            connectionId: connection.id,
            customerId,
            checkpointKey: "sync",
            checkpointVersion: 1,
            checkpointState: {
              version: 1,
              mode: input.mode ?? "incremental",
              stage,
              startDate: effectiveStartDate,
              endDate,
              counts,
            } satisfies SyncCheckpointState,
            lastRecordDate: endDate,
            syncRunId: syncRun.id,
            status: "in_progress",
          })

          await this.repository.extendSyncLock({
            providerKey,
            connectionId: connection.id,
            projectId: connection.projectId,
            lockToken: lock.lockToken,
            leaseSeconds: 3600,
          })
        })
      }

      const stages: Array<{
        key: Exclude<SyncStage, "completed">
        run: () => Promise<unknown[]>
        bundleKey: keyof GoogleAdsNormalizedBundle
        countKey: string
      }> = [
        {
          key: "customers",
          run: () =>
            this.customerService.listCustomerAccounts({ connectionId: connection.id, customerId }),
          bundleKey: "customers",
          countKey: "customers",
        },
        {
          key: "campaigns",
          run: () =>
            this.campaignService.listCampaigns({ connectionId: connection.id, customerId }),
          bundleKey: "campaigns",
          countKey: "campaigns",
        },
        {
          key: "campaignMetrics",
          run: () =>
            this.campaignService.listCampaignMetrics({
              connectionId: connection.id,
              customerId,
              startDate: effectiveStartDate,
              endDate,
            }),
          bundleKey: "campaignMetrics",
          countKey: "campaignMetrics",
        },
        {
          key: "adGroups",
          run: () => this.adGroupService.listAdGroups({ connectionId: connection.id, customerId }),
          bundleKey: "adGroups",
          countKey: "adGroups",
        },
        {
          key: "adGroupMetrics",
          run: () =>
            this.adGroupService.listAdGroupMetrics({
              connectionId: connection.id,
              customerId,
              startDate: effectiveStartDate,
              endDate,
            }),
          bundleKey: "adGroupMetrics",
          countKey: "adGroupMetrics",
        },
        {
          key: "ads",
          run: () => this.adService.listAds({ connectionId: connection.id, customerId }),
          bundleKey: "ads",
          countKey: "ads",
        },
        {
          key: "adMetrics",
          run: () =>
            this.adService.listAdMetrics({
              connectionId: connection.id,
              customerId,
              startDate: effectiveStartDate,
              endDate,
            }),
          bundleKey: "adMetrics",
          countKey: "adMetrics",
        },
        {
          key: "keywords",
          run: () => this.keywordService.listKeywords({ connectionId: connection.id, customerId }),
          bundleKey: "keywords",
          countKey: "keywords",
        },
        {
          key: "keywordMetrics",
          run: () =>
            this.keywordService.listKeywordMetrics({
              connectionId: connection.id,
              customerId,
              startDate: effectiveStartDate,
              endDate,
            }),
          bundleKey: "keywordMetrics",
          countKey: "keywordMetrics",
        },
        {
          key: "searchTerms",
          run: () =>
            this.insightsService.listSearchTerms({
              connectionId: connection.id,
              customerId,
              startDate: effectiveStartDate,
              endDate,
            }),
          bundleKey: "searchTerms",
          countKey: "searchTerms",
        },
        {
          key: "geoMetrics",
          run: () =>
            this.insightsService.listGeoMetrics({
              connectionId: connection.id,
              customerId,
              startDate: effectiveStartDate,
              endDate,
            }),
          bundleKey: "geoMetrics",
          countKey: "geoMetrics",
        },
        {
          key: "deviceMetrics",
          run: () =>
            this.insightsService.listDeviceMetrics({
              connectionId: connection.id,
              customerId,
              startDate: effectiveStartDate,
              endDate,
            }),
          bundleKey: "deviceMetrics",
          countKey: "deviceMetrics",
        },
        {
          key: "conversionActions",
          run: () =>
            this.insightsService.listConversionActions({ connectionId: connection.id, customerId }),
          bundleKey: "conversionActions",
          countKey: "conversionActions",
        },
      ]

      for (let index = 0; index < stages.length; index += 1) {
        const stage = stages[index]
        if (index < resumeFromStageIndex) {
          continue
        }

        const rows = await stage.run()
        const stageBundle = createEmptyBundle()
        ;(stageBundle[stage.bundleKey] as unknown[]).push(...(rows as never[]))
        await persistStage(stage.key, stageBundle, { [stage.countKey]: rows.length })
      }

      await this.repository.withTransaction(async () => {
        await this.repository.markSyncRunCompleted(syncRun.id, actor.userId, {
          customers: counts.customers ?? 0,
          campaigns: counts.campaigns ?? 0,
          campaignMetrics: counts.campaignMetrics ?? 0,
          adGroups: counts.adGroups ?? 0,
          adGroupMetrics: counts.adGroupMetrics ?? 0,
          ads: counts.ads ?? 0,
          adMetrics: counts.adMetrics ?? 0,
          keywords: counts.keywords ?? 0,
          keywordMetrics: counts.keywordMetrics ?? 0,
          searchTerms: counts.searchTerms ?? 0,
          geoMetrics: counts.geoMetrics ?? 0,
          deviceMetrics: counts.deviceMetrics ?? 0,
          conversionActions: counts.conversionActions ?? 0,
          totalRecords: persistedCount,
        })

        await this.repository.saveSyncCheckpoint({
          providerKey,
          connectionId: connection.id,
          customerId,
          checkpointKey: "sync",
          checkpointVersion: 1,
          checkpointState: {
            version: 1,
            mode: input.mode ?? "incremental",
            stage: "completed",
            startDate: effectiveStartDate,
            endDate,
            counts,
          } satisfies SyncCheckpointState,
          lastRecordDate: endDate,
          syncRunId: syncRun.id,
          status: "completed",
        })
      })

      const completed = await this.repository.findSyncRunById(syncRun.id)
      if (!completed) {
        throw new GoogleAdsIntegrationError(
          "Sync run not found after completion.",
          "GOOGLE_ADS_SYNC_FAILED",
          false,
          500
        )
      }

      return completed
    } catch (error) {
      const mapped =
        error instanceof GoogleAdsIntegrationError
          ? error
          : new GoogleAdsIntegrationError(
              "Google Ads sync failed.",
              "GOOGLE_ADS_SYNC_FAILED",
              false,
              500
            )

      await this.repository.markSyncRunFailed(syncRun.id, actor.userId, mapped.code, mapped.message)
      throw mapped
    } finally {
      await this.repository.releaseSyncLock({
        providerKey,
        connectionId: connection.id,
        projectId: connection.projectId,
        lockToken: lock.lockToken,
      })
    }
  }

  async listRecords(actor: AuthenticatedActor, query: GoogleAdsRecordQuery) {
    assertAuthorized(actor)

    const connection = await this.oauthRepository.findConnectionById(query.connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new GoogleAdsIntegrationError(
        "Google Ads connection not found.",
        "GOOGLE_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

    if (connection.status !== "connected") {
      throw new GoogleAdsIntegrationError(
        "Google Ads connection is not connected.",
        "GOOGLE_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const selectedCustomer = await this.oauthRepository.findAccessibleCustomerAccount(
      connection.id,
      query.customerId
    )
    if (!selectedCustomer) {
      throw new GoogleAdsIntegrationError(
        "Google Ads customer is not accessible for this connection.",
        "GOOGLE_ADS_INVALID_CUSTOMER",
        false,
        400
      )
    }

    return this.repository.listRecords(query)
  }

  async listAccessibleAccounts(actor: AuthenticatedActor, input: { connectionId: string }) {
    assertAuthorized(actor)

    const connection = await this.oauthRepository.findConnectionById(input.connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new GoogleAdsIntegrationError(
        "Google Ads connection not found.",
        "GOOGLE_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

    let accounts = await this.oauthRepository.listAccessibleCustomerAccounts(connection.id)
    if (accounts.length > 0) {
      return accounts
    }

    const discoveredCustomerIds = await this.client.listAccessibleCustomerIds(connection.id)
    if (discoveredCustomerIds.length === 0) {
      return []
    }

    await this.oauthRepository.replaceAccessibleCustomerAccounts({
      connectionId: connection.id,
      actorUserId: actor.userId,
      selectedCustomerId: discoveredCustomerIds[0],
      accounts: discoveredCustomerIds.map((customerId) => ({
        customerId,
        displayName: `Google Ads ${customerId}`,
        currencyCode: null,
        timeZone: null,
      })),
    })

    accounts = await this.oauthRepository.listAccessibleCustomerAccounts(connection.id)
    return accounts
  }

  private async resolveAccessibleCustomerAccount(
    connectionId: string,
    customerId: string,
    actorUserId: string
  ) {
    const existing = await this.oauthRepository.findAccessibleCustomerAccount(
      connectionId,
      customerId
    )
    if (existing) {
      return existing
    }

    const discoveredCustomerIds = await this.client.listAccessibleCustomerIds(connectionId)
    if (discoveredCustomerIds.length === 0) {
      return null
    }

    await this.oauthRepository.replaceAccessibleCustomerAccounts({
      connectionId,
      actorUserId,
      selectedCustomerId: discoveredCustomerIds.includes(customerId)
        ? customerId
        : discoveredCustomerIds[0],
      accounts: discoveredCustomerIds.map((id) => ({
        customerId: id,
        displayName: `Google Ads ${id}`,
        currencyCode: null,
        timeZone: null,
      })),
    })

    return this.oauthRepository.findAccessibleCustomerAccount(connectionId, customerId)
  }

  private normalizeCheckpoint(
    raw: Record<string, unknown> | undefined,
    mode: "full" | "incremental",
    startDate: string,
    endDate: string
  ): SyncCheckpointState {
    if (!raw) {
      return {
        version: 1,
        mode,
        stage: "customers",
        startDate,
        endDate,
        counts: {},
      }
    }

    const stage =
      typeof raw.stage === "string" && STAGE_ORDER.includes(raw.stage as SyncStage)
        ? (raw.stage as SyncStage)
        : "customers"

    return {
      version: Number(raw.version) === 1 ? 1 : 1,
      mode: raw.mode === "full" || raw.mode === "incremental" ? raw.mode : mode,
      stage,
      startDate: typeof raw.startDate === "string" ? raw.startDate : startDate,
      endDate: typeof raw.endDate === "string" ? raw.endDate : endDate,
      counts: (raw.counts as Record<string, number>) ?? {},
    }
  }
}
