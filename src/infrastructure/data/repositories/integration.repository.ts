import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"
import type {
  AuthorizeConnectorRequestDto,
  Connection,
  ConnectorHealth,
  ConnectorLifecycleAction,
  CreateConnectionRequestDto,
  DisconnectConnectionRequestDto,
  GetConnectorHealthRequestDto,
  GetIntegrationStatusRequestDto,
  GetSyncHistoryRequestDto,
  IntegrationEvent,
  IntegrationRepository,
  IntegrationStatusDto,
  PauseSyncRequestDto,
  RefreshConnectionRequestDto,
  ResumeSyncRequestDto,
  RetrySyncRequestDto,
  RunSyncRequestDto,
  ScheduleSyncRequestDto,
  SelectAccountRequestDto,
  SyncHistoryDto,
  SyncJob,
  SyncJobStatus,
  SyncRun,
  SyncSchedule,
} from "@/application/contracts/integration.contracts"
import { ValidationError, mapRepositoryError, NotFoundError } from "@/infrastructure/data/errors"
import { traceFrontendExecution } from "@/lib/debug/frontend-execution-trace"

import { createHttpDataClient } from "../api/http-data-client"
import { resolveAuthenticationApiBaseUrl, resolveRepositoryBackend } from "./repository-runtime"
import {
  InMemoryIntegrationRepository,
  resetInMemoryIntegrationRepositoryState,
} from "./integration.repository.in-memory"

interface GoogleOAuthStartResponse {
  authorizationUrl: string
  connectionId: string
  state: string
  projectId: string
  workspaceId: string | null
}

interface GoogleAdsSyncApiResponse {
  id: string
  status: "pending" | "running" | "completed" | "failed"
  startedAt: string | null
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  metrics?: Record<string, number>
}

interface GoogleAdsRecordItem {
  id: string
  updatedAt: string
}

interface GoogleAdsAccessibleAccountApiItem {
  customerId: string
  displayName: string | null
  isSelected: boolean
}

interface GoogleActiveConnectionResponse {
  connection: {
    id: string
    status: string
    providerAccountId: string | null
    providerAccountName: string | null
    providerAccountEmail: string | null
    connectedAt: string | null
    lastSyncedAt?: string | null
    developerTokenConfigured?: boolean
    customerAccounts: Array<{ customerId: string; displayName: string | null; isSelected: boolean }>
  } | null
}

interface GoogleConnectionLifecycleResponse {
  connectionId: string
  status: "connected" | "paused" | "disconnected"
  updatedAt: string
}

interface GoogleTimelineEventApiItem {
  id: string
  action: string
  occurredAt: string
  actor: "system" | "user"
  message: string
}

interface GoogleTimelineEventsApiResponse {
  connectionId: string
  items: GoogleTimelineEventApiItem[]
}

interface GoogleRetryStatusApiResponse {
  connectionId: string
  available: boolean
  reason:
    | "retryable_failure"
    | "connection_not_connected"
    | "sync_running"
    | "no_previous_failure"
    | "non_retryable_failure"
  lastOperation?: {
    syncRunId: string
    status: "pending" | "running" | "completed" | "failed"
    customerId: string
    startDate: string
    endDate: string
    errorCode: string | null
    errorMessage: string | null
    createdAt: string
  }
}

interface StoredState {
  connections: Record<string, Connection>
  jobs: Record<string, SyncJob>
  runs: Record<string, SyncRun[]>
}

interface RuntimeProviderProfile {
  providerId: string
  connectorId: string
  connectorDefinitionId: string
  displayName: string
  oauth: {
    startPath: string
    activeConnectionPath: string
    callbackStatusParam: string
    callbackConnectionIdParam: string
    callbackAccountNameParam: string
    callbackAccountEmailParam: string
    callbackReasonParam: string
  }
  endpoints: {
    sync: string
    records: string
    accounts: string
    events: (connectionId: string) => string
    retry: (connectionId: string) => string
    retryStatus: (connectionId: string) => string
    pause: (connectionId: string) => string
    resume: (connectionId: string) => string
    disconnect: (connectionId: string) => string
    reconnect: (connectionId: string) => string
  }
  metadata: {
    availableAccountsKey: string
  }
}

const STORAGE_KEY = "integration-runtime-state:v1"

const GOOGLE_ADS_PROVIDER_PROFILE: RuntimeProviderProfile = {
  providerId: "google-ads",
  connectorId: "google_ads",
  connectorDefinitionId: "connector_def_google_ads",
  displayName: "Google Ads",
  oauth: {
    startPath: "/v1/integrations/google/oauth/start",
    activeConnectionPath: "/v1/integrations/google/connection",
    callbackStatusParam: "google_oauth",
    callbackConnectionIdParam: "google_connection_id",
    callbackAccountNameParam: "google_account_name",
    callbackAccountEmailParam: "google_account_email",
    callbackReasonParam: "reason",
  },
  endpoints: {
    sync: "/v1/integrations/google-ads/sync",
    records: "/v1/integrations/google-ads/records",
    accounts: "/v1/integrations/google-ads/accounts",
    events: (connectionId: string) => `/v1/integrations/${connectionId}/events`,
    retry: (connectionId: string) => `/v1/integrations/${connectionId}/retry`,
    retryStatus: (connectionId: string) => `/v1/integrations/${connectionId}/retry-status`,
    pause: (connectionId: string) => `/v1/integrations/${connectionId}/pause`,
    resume: (connectionId: string) => `/v1/integrations/${connectionId}/resume`,
    disconnect: (connectionId: string) => `/v1/integrations/${connectionId}/disconnect`,
    reconnect: (connectionId: string) => `/v1/integrations/${connectionId}/reconnect`,
  },
  metadata: {
    availableAccountsKey: "availableGoogleAdsCustomerAccounts",
  },
}

const SNAPCHAT_ADS_PROVIDER_PROFILE: RuntimeProviderProfile = {
  providerId: "snapchat-ads",
  connectorId: "snapchat_ads",
  connectorDefinitionId: "connector_def_snapchat_ads",
  displayName: "Snapchat Ads",
  oauth: {
    startPath: "/v1/integrations/snapchat-ads/oauth/start",
    activeConnectionPath: "/v1/integrations/snapchat-ads/connection",
    callbackStatusParam: "snapchat_oauth",
    callbackConnectionIdParam: "snapchat_connection_id",
    callbackAccountNameParam: "snapchat_account_name",
    callbackAccountEmailParam: "snapchat_account_email",
    callbackReasonParam: "reason",
  },
  endpoints: {
    sync: "/v1/integrations/snapchat-ads/sync",
    records: "/v1/integrations/snapchat-ads/records",
    accounts: "/v1/integrations/snapchat-ads/accounts",
    events: (connectionId: string) => `/v1/integrations/${connectionId}/events`,
    retry: (connectionId: string) => `/v1/integrations/${connectionId}/retry`,
    retryStatus: (connectionId: string) => `/v1/integrations/${connectionId}/retry-status`,
    pause: (connectionId: string) => `/v1/integrations/${connectionId}/pause`,
    resume: (connectionId: string) => `/v1/integrations/${connectionId}/resume`,
    disconnect: (connectionId: string) => `/v1/integrations/${connectionId}/disconnect`,
    reconnect: (connectionId: string) => `/v1/integrations/${connectionId}/reconnect`,
  },
  metadata: {
    availableAccountsKey: "availableSnapchatAdsCustomerAccounts",
  },
}

const META_ADS_PROVIDER_PROFILE: RuntimeProviderProfile = {
  providerId: "meta-ads",
  connectorId: "meta_ads",
  connectorDefinitionId: "connector_def_meta_ads",
  displayName: "Meta Ads",
  oauth: {
    startPath: "/v1/integrations/meta-ads/oauth/start",
    activeConnectionPath: "/v1/integrations/meta-ads/connection",
    callbackStatusParam: "meta_oauth",
    callbackConnectionIdParam: "meta_connection_id",
    callbackAccountNameParam: "meta_account_name",
    callbackAccountEmailParam: "meta_account_email",
    callbackReasonParam: "reason",
  },
  endpoints: {
    sync: "/v1/integrations/meta-ads/sync",
    records: "/v1/integrations/meta-ads/records",
    accounts: "/v1/integrations/meta-ads/accounts",
    events: (connectionId: string) => `/v1/integrations/${connectionId}/events`,
    retry: (connectionId: string) => `/v1/integrations/${connectionId}/retry`,
    retryStatus: (connectionId: string) => `/v1/integrations/${connectionId}/retry-status`,
    pause: (connectionId: string) => `/v1/integrations/${connectionId}/pause`,
    resume: (connectionId: string) => `/v1/integrations/${connectionId}/resume`,
    disconnect: (connectionId: string) => `/v1/integrations/${connectionId}/disconnect`,
    reconnect: (connectionId: string) => `/v1/integrations/${connectionId}/reconnect`,
  },
  metadata: {
    availableAccountsKey: "availableMetaAdsCustomerAccounts",
  },
}

const SALLA_PROVIDER_PROFILE: RuntimeProviderProfile = {
  providerId: "salla",
  connectorId: "salla",
  connectorDefinitionId: "connector_def_salla",
  displayName: "Salla",
  oauth: {
    startPath: "/v1/integrations/salla/oauth/start",
    activeConnectionPath: "/v1/integrations/salla/connection",
    callbackStatusParam: "salla_oauth",
    callbackConnectionIdParam: "salla_connection_id",
    callbackAccountNameParam: "salla_account_name",
    callbackAccountEmailParam: "salla_account_email",
    callbackReasonParam: "reason",
  },
  endpoints: {
    sync: "/v1/integrations/salla/sync",
    records: "/v1/integrations/salla/records",
    accounts: "/v1/integrations/salla/accounts",
    events: (connectionId: string) => `/v1/integrations/${connectionId}/events`,
    retry: (connectionId: string) => `/v1/integrations/${connectionId}/retry`,
    retryStatus: (connectionId: string) => `/v1/integrations/${connectionId}/retry-status`,
    pause: (connectionId: string) => `/v1/integrations/${connectionId}/pause`,
    resume: (connectionId: string) => `/v1/integrations/${connectionId}/resume`,
    disconnect: (connectionId: string) => `/v1/integrations/${connectionId}/disconnect`,
    reconnect: (connectionId: string) => `/v1/integrations/${connectionId}/reconnect`,
  },
  metadata: {
    availableAccountsKey: "availableSallaCustomerAccounts",
  },
}

const SHOPIFY_PROVIDER_PROFILE: RuntimeProviderProfile = {
  providerId: "shopify",
  connectorId: "shopify",
  connectorDefinitionId: "connector_def_shopify",
  displayName: "Shopify",
  oauth: {
    startPath: "/v1/integrations/shopify/oauth/start",
    activeConnectionPath: "/v1/integrations/shopify/connection",
    callbackStatusParam: "shopify_oauth",
    callbackConnectionIdParam: "shopify_connection_id",
    callbackAccountNameParam: "shopify_account_name",
    callbackAccountEmailParam: "shopify_account_email",
    callbackReasonParam: "reason",
  },
  endpoints: {
    sync: "/v1/integrations/shopify/sync",
    records: "/v1/integrations/shopify/records",
    accounts: "/v1/integrations/shopify/accounts",
    events: (connectionId: string) => `/v1/integrations/${connectionId}/events`,
    retry: (connectionId: string) => `/v1/integrations/${connectionId}/retry`,
    retryStatus: (connectionId: string) => `/v1/integrations/${connectionId}/retry-status`,
    pause: (connectionId: string) => `/v1/integrations/${connectionId}/pause`,
    resume: (connectionId: string) => `/v1/integrations/${connectionId}/resume`,
    disconnect: (connectionId: string) => `/v1/integrations/${connectionId}/disconnect`,
    reconnect: (connectionId: string) => `/v1/integrations/${connectionId}/reconnect`,
  },
  metadata: {
    availableAccountsKey: "availableShopifyCustomerAccounts",
  },
}

const GOOGLE_ANALYTICS_PROVIDER_PROFILE: RuntimeProviderProfile = {
  providerId: "google-analytics",
  connectorId: "google-analytics",
  connectorDefinitionId: "connector_def_google_analytics",
  displayName: "Google Analytics 4",
  oauth: {
    startPath: "/v1/integrations/google-analytics/oauth/start",
    activeConnectionPath: "/v1/integrations/google-analytics/connection",
    callbackStatusParam: "google_analytics_oauth",
    callbackConnectionIdParam: "google_analytics_connection_id",
    callbackAccountNameParam: "google_analytics_account_name",
    callbackAccountEmailParam: "google_analytics_account_email",
    callbackReasonParam: "reason",
  },
  endpoints: {
    sync: "/v1/integrations/google-analytics/sync",
    records: "/v1/integrations/google-analytics/records",
    accounts: "/v1/integrations/google-analytics/accounts",
    events: (connectionId: string) => `/v1/integrations/${connectionId}/events`,
    retry: (connectionId: string) => `/v1/integrations/${connectionId}/retry`,
    retryStatus: (connectionId: string) => `/v1/integrations/${connectionId}/retry-status`,
    pause: (connectionId: string) => `/v1/integrations/${connectionId}/pause`,
    resume: (connectionId: string) => `/v1/integrations/${connectionId}/resume`,
    disconnect: (connectionId: string) => `/v1/integrations/${connectionId}/disconnect`,
    reconnect: (connectionId: string) => `/v1/integrations/${connectionId}/reconnect`,
  },
  metadata: {
    availableAccountsKey: "availableGoogleAnalyticsAccounts",
  },
}

const ZID_PROVIDER_PROFILE: RuntimeProviderProfile = {
  providerId: "zid",
  connectorId: "zid",
  connectorDefinitionId: "connector_def_zid",
  displayName: "Zid",
  oauth: {
    startPath: "/v1/integrations/zid/oauth/start",
    activeConnectionPath: "/v1/integrations/zid/connection",
    callbackStatusParam: "zid_oauth",
    callbackConnectionIdParam: "zid_connection_id",
    callbackAccountNameParam: "zid_account_name",
    callbackAccountEmailParam: "zid_account_email",
    callbackReasonParam: "reason",
  },
  endpoints: {
    sync: "/v1/integrations/zid/sync",
    records: "/v1/integrations/zid/records",
    accounts: "/v1/integrations/zid/accounts",
    events: (connectionId: string) => `/v1/integrations/${connectionId}/events`,
    retry: (connectionId: string) => `/v1/integrations/${connectionId}/retry`,
    retryStatus: (connectionId: string) => `/v1/integrations/${connectionId}/retry-status`,
    pause: (connectionId: string) => `/v1/integrations/${connectionId}/pause`,
    resume: (connectionId: string) => `/v1/integrations/${connectionId}/resume`,
    disconnect: (connectionId: string) => `/v1/integrations/${connectionId}/disconnect`,
    reconnect: (connectionId: string) => `/v1/integrations/${connectionId}/reconnect`,
  },
  metadata: {
    availableAccountsKey: "availableZidCustomerAccounts",
  },
}

const TIKTOK_ADS_PROVIDER_PROFILE: RuntimeProviderProfile = {
  providerId: "tiktok-ads",
  connectorId: "tiktok_ads",
  connectorDefinitionId: "connector_def_tiktok_ads",
  displayName: "TikTok Ads",
  oauth: {
    startPath: "/v1/integrations/tiktok-ads/oauth/start",
    activeConnectionPath: "/v1/integrations/tiktok-ads/connection",
    callbackStatusParam: "tiktok_ads_oauth",
    callbackConnectionIdParam: "tiktok_ads_connection_id",
    callbackAccountNameParam: "tiktok_ads_account_name",
    callbackAccountEmailParam: "tiktok_ads_account_email",
    callbackReasonParam: "reason",
  },
  endpoints: {
    sync: "/v1/integrations/tiktok-ads/sync",
    records: "/v1/integrations/tiktok-ads/records",
    accounts: "/v1/integrations/tiktok-ads/accounts",
    events: (connectionId: string) => `/v1/integrations/${connectionId}/events`,
    retry: (connectionId: string) => `/v1/integrations/${connectionId}/retry`,
    retryStatus: (connectionId: string) => `/v1/integrations/${connectionId}/retry-status`,
    pause: (connectionId: string) => `/v1/integrations/${connectionId}/pause`,
    resume: (connectionId: string) => `/v1/integrations/${connectionId}/resume`,
    disconnect: (connectionId: string) => `/v1/integrations/${connectionId}/disconnect`,
    reconnect: (connectionId: string) => `/v1/integrations/${connectionId}/reconnect`,
  },
  metadata: {
    availableAccountsKey: "availableTikTokAdsCustomerAccounts",
  },
}

const PROVIDER_PROFILES_BY_DEFINITION: Record<string, RuntimeProviderProfile> = {
  [GOOGLE_ADS_PROVIDER_PROFILE.connectorDefinitionId]: GOOGLE_ADS_PROVIDER_PROFILE,
  [SNAPCHAT_ADS_PROVIDER_PROFILE.connectorDefinitionId]: SNAPCHAT_ADS_PROVIDER_PROFILE,
  [SALLA_PROVIDER_PROFILE.connectorDefinitionId]: SALLA_PROVIDER_PROFILE,
  [META_ADS_PROVIDER_PROFILE.connectorDefinitionId]: META_ADS_PROVIDER_PROFILE,
  [SHOPIFY_PROVIDER_PROFILE.connectorDefinitionId]: SHOPIFY_PROVIDER_PROFILE,
  [GOOGLE_ANALYTICS_PROVIDER_PROFILE.connectorDefinitionId]: GOOGLE_ANALYTICS_PROVIDER_PROFILE,
  [ZID_PROVIDER_PROFILE.connectorDefinitionId]: ZID_PROVIDER_PROFILE,
  [TIKTOK_ADS_PROVIDER_PROFILE.connectorDefinitionId]: TIKTOK_ADS_PROVIDER_PROFILE,
}

const DEFAULT_WORKSPACE_ID = "ws_connections_center"
const DEFAULT_CRON = "*/30 * * * *"
const DEFAULT_TIMEZONE = "Asia/Riyadh"

function resolveProviderProfileByDefinition(connectorDefinitionId: string) {
  return PROVIDER_PROFILES_BY_DEFINITION[connectorDefinitionId] ?? null
}

function resolveProviderProfileByConnection(connection: Connection) {
  return resolveProviderProfileByDefinition(connection.connectorDefinitionId)
}

function nowIso() {
  return new Date().toISOString()
}

function generateUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`
  }

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`
}

function toLifecycleStatus(status: GoogleAdsSyncApiResponse["status"]): SyncJobStatus {
  if (status === "failed") {
    return "failed"
  }

  if (status === "running") {
    return "running"
  }

  if (status === "pending") {
    return "queued"
  }

  return "completed"
}

function loadState(): StoredState {
  if (typeof window === "undefined") {
    return { connections: {}, jobs: {}, runs: {} }
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return { connections: {}, jobs: {}, runs: {} }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>
    return {
      connections: parsed.connections ?? {},
      jobs: parsed.jobs ?? {},
      runs: parsed.runs ?? {},
    }
  } catch {
    return { connections: {}, jobs: {}, runs: {} }
  }
}

function saveState(state: StoredState) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function readOAuthCallback(profile: RuntimeProviderProfile): {
  status: "connected" | "error" | null
  connectionId: string | null
  accountName: string | null
  accountEmail: string | null
  reason: string | null
} {
  if (typeof window === "undefined") {
    return {
      status: null,
      connectionId: null,
      accountName: null,
      accountEmail: null,
      reason: null,
    }
  }

  const params = new URLSearchParams(window.location.search)
  const oauthStatus = params.get(profile.oauth.callbackStatusParam)

  return {
    status: oauthStatus === "connected" || oauthStatus === "error" ? oauthStatus : null,
    connectionId: params.get(profile.oauth.callbackConnectionIdParam),
    accountName: params.get(profile.oauth.callbackAccountNameParam),
    accountEmail: params.get(profile.oauth.callbackAccountEmailParam),
    reason: params.get(profile.oauth.callbackReasonParam),
  }
}

function parseStoredProviderAccounts(raw: string | undefined) {
  if (!raw) {
    return [] as GoogleAdsAccessibleAccountApiItem[]
  }

  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
    if (!Array.isArray(parsed)) {
      return [] as GoogleAdsAccessibleAccountApiItem[]
    }

    return parsed
      .map((item) => ({
        customerId: typeof item.customerId === "string" ? item.customerId : "",
        displayName: typeof item.displayName === "string" ? item.displayName : null,
        isSelected: Boolean(item.isSelected),
      }))
      .filter((item) => item.customerId.length > 0)
  } catch {
    return [] as GoogleAdsAccessibleAccountApiItem[]
  }
}

function normalizeProviderAccounts(items: Array<Record<string, unknown>>) {
  return items
    .map((item) => ({
      customerId: typeof item.customerId === "string" ? item.customerId : "",
      displayName: typeof item.displayName === "string" ? item.displayName : null,
      isSelected: Boolean(item.isSelected),
    }))
    .filter((item) => item.customerId.length > 0)
}

export class RestIntegrationRepository implements IntegrationRepository {
  private state = loadState()

  constructor(
    private readonly options?: {
      getSession?: () => AuthSessionDto | null
      getWorkspaceId?: () => string | null
    }
  ) {}

  private get client() {
    return createHttpDataClient({
      ...this.options,
      baseUrl: resolveAuthenticationApiBaseUrl(),
    })
  }

  private persist() {
    saveState(this.state)
  }

  private upsertConnection(connection: Connection) {
    this.state.connections[connection.connectionId] = connection
    this.persist()
  }

  private getConnectionOrThrow(connectionId: string) {
    const connection = this.state.connections[connectionId]
    if (!connection) {
      throw new NotFoundError({
        code: "connection_not_found",
        message: `Connection ${connectionId} was not found.`,
      })
    }

    return connection
  }

  private removeConnectionArtifacts(connectionId: string) {
    delete this.state.connections[connectionId]
    delete this.state.jobs[connectionId]
    delete this.state.runs[connectionId]
  }

  private pruneUnrecoveredConnections(validConnectionIds: string[]) {
    const valid = new Set(validConnectionIds)
    for (const [connectionId, connection] of Object.entries(this.state.connections)) {
      if (!resolveProviderProfileByDefinition(connection.connectorDefinitionId)) {
        continue
      }

      if (valid.has(connectionId)) {
        continue
      }

      if (connection.status === "draft") {
        continue
      }

      this.removeConnectionArtifacts(connectionId)
    }

    this.persist()
  }

  private async fetchTimelineEvents(connectionId: string): Promise<IntegrationEvent[]> {
    const response = await this.client.get<GoogleTimelineEventsApiResponse>(
      GOOGLE_ADS_PROVIDER_PROFILE.endpoints.events(connectionId),
      {
        query: {
          limit: 20,
        },
      }
    )

    return (response.items ?? []).map((event) => ({
      eventId: event.id,
      connectionId,
      action: event.action as ConnectorLifecycleAction,
      timestamp: event.occurredAt,
      actor: event.actor,
      message: event.message,
    }))
  }

  private async fetchRetryStatus(connectionId: string): Promise<GoogleRetryStatusApiResponse> {
    return this.client.get<GoogleRetryStatusApiResponse>(
      GOOGLE_ADS_PROVIDER_PROFILE.endpoints.retryStatus(connectionId)
    )
  }

  private mapSyncRun(connectionId: string, response: GoogleAdsSyncApiResponse): SyncRun {
    const syncJobId = this.state.jobs[connectionId]?.syncJobId ?? `sync_job_${connectionId}`
    return {
      syncRunId: response.id,
      syncJobId,
      status: toLifecycleStatus(response.status),
      attempt: 1,
      result: {
        recordsRead: response.metrics?.totalRecords ?? 0,
        recordsWritten: response.metrics?.totalRecords ?? 0,
        recordsFailed: response.status === "failed" ? 1 : 0,
        durationMs: 0,
        startedAt: response.startedAt ?? nowIso(),
        finishedAt: response.completedAt ?? nowIso(),
        message:
          response.errorMessage ??
          (response.status === "failed" ? "Sync failed." : "Sync completed."),
      },
      errorCode: response.errorCode ?? undefined,
      errorMessage: response.errorMessage ?? undefined,
      startedAt: response.startedAt ?? nowIso(),
      finishedAt: response.completedAt ?? undefined,
    }
  }

  private async fetchRecordCount(
    providerProfile: RuntimeProviderProfile,
    connectionId: string,
    customerId: string
  ) {
    traceFrontendExecution({
      step: "getRecords()",
      connectionId,
      customerId,
      connectionCount: Object.keys(this.state.connections).length,
    })

    const response = await this.client.get<{ items: GoogleAdsRecordItem[] }>(
      providerProfile.endpoints.records,
      {
        query: {
          connectionId,
          customerId,
          pageSize: 1,
        },
      }
    )

    return response.items.length
  }

  private async fetchAccessibleAccounts(
    connectionId: string,
    providerProfile: RuntimeProviderProfile | null
  ) {
    const response = await this.client.get<{ items: Array<Record<string, unknown>> }>(
      providerProfile?.endpoints.accounts ?? GOOGLE_ADS_PROVIDER_PROFILE.endpoints.accounts,
      {
        query: {
          connectionId,
        },
      }
    )

    return normalizeProviderAccounts(response.items)
  }

  async createConnection(input: CreateConnectionRequestDto): Promise<Connection> {
    try {
      const providerProfile = resolveProviderProfileByDefinition(input.connectorDefinitionId)
      if (!providerProfile) {
        throw new ValidationError({
          code: "connector_not_supported",
          message: "This connector is not available in production integration runtime.",
        })
      }

      const start = await this.client.post<
        {
          workspaceId?: string | null
          projectId?: string | null
          connectionName?: string | null
          shopDomain?: string | null
        },
        GoogleOAuthStartResponse
      >(providerProfile.oauth.startPath, {
        workspaceId: input.workspaceId,
        projectId: null,
        connectionName: input.metadata?.connectionName ?? input.metadata?.accountName ?? null,
        // Only Shopify's oauthStart reads this -- every other provider's generic route
        // ignores unrecognized fields, so it's safe to always send it.
        shopDomain: input.metadata?.shopDomain ?? null,
      })

      const connection: Connection = {
        connectionId: start.connectionId,
        workspaceId: input.workspaceId ?? start.workspaceId ?? DEFAULT_WORKSPACE_ID,
        connectorId: providerProfile.connectorId,
        connectorDefinitionId: providerProfile.connectorDefinitionId,
        status: "draft",
        metadata: {
          projectId: start.projectId,
          oauthState: start.state,
          oauthAuthorizationUrl: start.authorizationUrl,
          accountName: input.metadata?.accountName ?? "Google Ads Account",
          customerId: "",
        },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }

      this.upsertConnection(connection)
      return connection
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  private async recoverConnectionForProvider(
    providerProfile: RuntimeProviderProfile
  ): Promise<Connection | null> {
    let backendConn: GoogleActiveConnectionResponse["connection"]
    try {
      const backendResponse = await this.client.get<GoogleActiveConnectionResponse>(
        providerProfile.oauth.activeConnectionPath
      )
      backendConn = backendResponse.connection
    } catch {
      // This provider's active-connection endpoint is unavailable or the user has no
      // connection there yet -- don't let it block recovery for other providers.
      return null
    }

    if (!backendConn) {
      return null
    }

    const recoveredStatus: Connection["status"] =
      backendConn.status === "paused"
        ? "paused"
        : backendConn.status === "disconnected"
          ? "disconnected"
          : "connected"

    const existing = this.state.connections[backendConn.id]
    const accounts = recoveredStatus === "connected" ? (backendConn.customerAccounts ?? []) : []
    const selectedAccount = accounts.find((a) => a.isSelected) ?? accounts[0] ?? null

    const recovered: Connection = {
      connectionId: backendConn.id,
      workspaceId:
        existing?.workspaceId ?? this.options?.getWorkspaceId?.() ?? DEFAULT_WORKSPACE_ID,
      connectorId: providerProfile.connectorId,
      connectorDefinitionId: providerProfile.connectorDefinitionId,
      status: recoveredStatus,
      metadata: {
        ...(existing?.metadata ?? {}),
        accountName:
          selectedAccount?.displayName ??
          backendConn.providerAccountName ??
          existing?.metadata.accountName ??
          `${providerProfile.displayName} Account`,
        accountEmail: backendConn.providerAccountEmail ?? existing?.metadata.accountEmail ?? "",
        customerId: selectedAccount?.customerId ?? existing?.metadata.customerId ?? "",
        [providerProfile.metadata.availableAccountsKey]: JSON.stringify(accounts),
      },
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      lastValidatedAt: nowIso(),
      lastSyncedAt: backendConn.lastSyncedAt ?? existing?.lastSyncedAt,
    }

    for (const [connectionId, connection] of Object.entries(this.state.connections)) {
      if (
        connection.connectorDefinitionId === providerProfile.connectorDefinitionId &&
        connectionId !== backendConn.id &&
        connection.status === "draft"
      ) {
        this.removeConnectionArtifacts(connectionId)
      }
    }

    this.upsertConnection(recovered)
    return recovered
  }

  async recoverConnections(): Promise<Connection[]> {
    try {
      // One GET per registered provider (6 today: Google Ads, Snapchat, Meta, Salla,
      // Shopify, Google Analytics) -- each is independent and already catches its own
      // failure internally (see recoverConnectionForProvider), so running them in
      // parallel is safe and turns this from N sequential round trips into one.
      const results = await Promise.all(
        Object.values(PROVIDER_PROFILES_BY_DEFINITION).map((providerProfile) =>
          this.recoverConnectionForProvider(providerProfile)
        )
      )
      const recovered = results.filter(
        (connection): connection is Connection => connection !== null
      )

      this.pruneUnrecoveredConnections(recovered.map((connection) => connection.connectionId))
      return recovered
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async validateConnection(input: { connectionId: string }): Promise<Connection> {
    try {
      const current = this.getConnectionOrThrow(input.connectionId)
      const providerProfile = resolveProviderProfileByConnection(current)
      if (!providerProfile) {
        throw new ValidationError({
          code: "connector_not_supported",
          message: "This connector is not available in production integration runtime.",
        })
      }
      const callback = readOAuthCallback(providerProfile)

      if (callback.status === "connected" && callback.connectionId === input.connectionId) {
        let accessibleAccounts: GoogleAdsAccessibleAccountApiItem[] = []
        try {
          const response = await this.client.get<{ items: Array<Record<string, unknown>> }>(
            providerProfile.endpoints.accounts,
            {
              query: {
                connectionId: input.connectionId,
              },
            }
          )

          accessibleAccounts = response.items
            .map((item) => ({
              customerId: typeof item.customerId === "string" ? item.customerId : "",
              displayName: typeof item.displayName === "string" ? item.displayName : null,
              isSelected: Boolean(item.isSelected),
            }))
            .filter((item) => item.customerId.length > 0)
        } catch {
          accessibleAccounts = []
        }

        const selectedAccount =
          accessibleAccounts.find((account) => account.isSelected) ?? accessibleAccounts[0] ?? null

        const next: Connection = {
          ...current,
          status: "connected",
          metadata: {
            ...current.metadata,
            accountName:
              selectedAccount?.displayName ?? callback.accountName ?? current.metadata.accountName,
            accountEmail: callback.accountEmail ?? "",
            customerId: selectedAccount?.customerId ?? "",
            [providerProfile.metadata.availableAccountsKey]: JSON.stringify(accessibleAccounts),
          },
          updatedAt: nowIso(),
          lastValidatedAt: nowIso(),
        }

        this.upsertConnection(next)
        return next
      }

      if (callback.status === "error" && callback.connectionId === input.connectionId) {
        const next: Connection = {
          ...current,
          status: "error",
          metadata: {
            ...current.metadata,
            oauthError: callback.reason ?? "oauth_failed",
          },
          updatedAt: nowIso(),
          lastValidatedAt: nowIso(),
        }

        this.upsertConnection(next)
        return next
      }

      if (current.status === "connected") {
        return {
          ...current,
          lastValidatedAt: nowIso(),
        }
      }

      // Local connection is draft with no matching callback URL — try backend to recover status.
      try {
        const backendResponse = await this.client.get<{
          connection: {
            id: string
            status: string
            providerAccountId: string | null
            providerAccountName: string | null
            providerAccountEmail: string | null
            connectedAt: string | null
            lastSyncedAt?: string | null
            customerAccounts: Array<{
              customerId: string
              displayName: string | null
              isSelected: boolean
            }>
          } | null
        }>(providerProfile.oauth.activeConnectionPath)

        const backendConn = backendResponse.connection
        // Trust backend as source of truth for any draft connection — IDs may differ after session resets.
        if (backendConn && backendConn.status === "connected") {
          const accounts = backendConn.customerAccounts ?? []
          const selectedAccount = accounts.find((a) => a.isSelected) ?? accounts[0] ?? null

          const next: Connection = {
            ...current,
            // Adopt the canonical backend connection ID so subsequent lookups are consistent.
            connectionId: backendConn.id,
            status: "connected",
            metadata: {
              ...current.metadata,
              accountName:
                selectedAccount?.displayName ??
                backendConn.providerAccountName ??
                current.metadata.accountName,
              accountEmail: backendConn.providerAccountEmail ?? "",
              customerId: selectedAccount?.customerId ?? "",
              [providerProfile.metadata.availableAccountsKey]: JSON.stringify(accounts),
            },
            updatedAt: nowIso(),
            lastValidatedAt: nowIso(),
            lastSyncedAt: backendConn.lastSyncedAt ?? current.lastSyncedAt,
          }

          // Remove stale draft entry and store under canonical backend ID.
          if (current.connectionId !== backendConn.id) {
            delete this.state.connections[current.connectionId]
          }
          this.upsertConnection(next)
          return next
        }
      } catch {
        // Backend sync failed — fall through to pending error.
      }

      throw new ValidationError({
        code: "oauth_callback_pending",
        message: "OAuth callback is pending for this connection.",
      })
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async selectAccount(input: SelectAccountRequestDto): Promise<void> {
    try {
      const current = this.getConnectionOrThrow(input.connectionId)
      const providerProfile = resolveProviderProfileByConnection(current)
      if (!providerProfile) {
        throw new ValidationError({
          code: "connector_not_supported",
          message: "This connector is not available in production integration runtime.",
        })
      }

      await this.client.post<{ connectionId: string; customerId: string }, unknown>(
        `/v1/integrations/${providerProfile.providerId}/accounts/select`,
        { connectionId: input.connectionId, customerId: input.customerId }
      )

      this.upsertConnection({
        ...current,
        metadata: {
          ...current.metadata,
          customerId: input.customerId,
        },
        updatedAt: nowIso(),
      })
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async authorizeConnector(input: AuthorizeConnectorRequestDto): Promise<Connection> {
    try {
      const connection = this.getConnectionOrThrow(input.connectionId)
      const providerProfile = resolveProviderProfileByConnection(connection)
      if (!providerProfile) {
        throw new ValidationError({
          code: "connector_not_supported",
          message: "This connector is not available in production integration runtime.",
        })
      }

      let authorizationUrl = connection.metadata.oauthAuthorizationUrl

      if (connection.status === "disconnected") {
        const reconnect = await this.client.post<Record<string, never>, GoogleOAuthStartResponse>(
          providerProfile.endpoints.reconnect(connection.connectionId),
          {}
        )

        authorizationUrl = reconnect.authorizationUrl
        const reconnectPending: Connection = {
          ...connection,
          status: "draft",
          metadata: {
            ...connection.metadata,
            oauthState: reconnect.state,
            oauthAuthorizationUrl: reconnect.authorizationUrl,
          },
          updatedAt: nowIso(),
        }
        this.upsertConnection(reconnectPending)
      }

      if (!authorizationUrl) {
        throw new ValidationError({
          code: "oauth_start_missing",
          message: "OAuth authorization URL is missing for this connection.",
        })
      }

      if (typeof window !== "undefined") {
        window.location.assign(authorizationUrl)
        // Keep the promise unresolved because browser navigation takes over.
        await new Promise<void>(() => undefined)
      }

      return connection
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async refreshConnection(input: RefreshConnectionRequestDto): Promise<Connection> {
    try {
      const connection = this.getConnectionOrThrow(input.connectionId)
      const next: Connection = {
        ...connection,
        updatedAt: nowIso(),
      }

      this.upsertConnection(next)
      return next
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async disconnectConnection(input: DisconnectConnectionRequestDto): Promise<Connection> {
    try {
      const connection = this.getConnectionOrThrow(input.connectionId)
      const providerProfile = resolveProviderProfileByConnection(connection)
      if (!providerProfile) {
        throw new ValidationError({
          code: "connector_not_supported",
          message: "This connector is not available in production integration runtime.",
        })
      }

      const response = await this.client.post<
        { reason?: string },
        GoogleConnectionLifecycleResponse
      >(providerProfile.endpoints.disconnect(connection.connectionId), {
        reason: input.reason,
      })

      const next: Connection = {
        ...connection,
        status: response.status,
        updatedAt: nowIso(),
      }

      this.upsertConnection(next)
      return next
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async deleteConnection(input: { connectionId: string }): Promise<void> {
    try {
      this.getConnectionOrThrow(input.connectionId)
      await this.client.delete<void>(`/v1/integrations/${input.connectionId}`)

      delete this.state.connections[input.connectionId]
      delete this.state.jobs[input.connectionId]
      delete this.state.runs[input.connectionId]
      this.persist()
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async runSync(input: RunSyncRequestDto): Promise<SyncRun> {
    try {
      let connection = this.getConnectionOrThrow(input.connectionId)
      let customerId = connection.metadata.customerId?.trim() ?? ""
      const providerProfile = resolveProviderProfileByConnection(connection)

      if (!customerId) {
        const availableAccounts = parseStoredProviderAccounts(
          connection.metadata[
            providerProfile?.metadata.availableAccountsKey ??
              GOOGLE_ADS_PROVIDER_PROFILE.metadata.availableAccountsKey
          ]
        )
        const selectedAccount =
          availableAccounts.find((account) => account.isSelected) ?? availableAccounts[0]

        if (selectedAccount) {
          customerId = selectedAccount.customerId
          connection = {
            ...connection,
            metadata: {
              ...connection.metadata,
              customerId,
              accountName: selectedAccount.displayName ?? connection.metadata.accountName,
            },
            updatedAt: nowIso(),
          }
          this.upsertConnection(connection)
        }
      }

      if (!customerId) {
        try {
          const accessibleAccounts = await this.fetchAccessibleAccounts(
            connection.connectionId,
            providerProfile
          )
          const selectedAccount =
            accessibleAccounts.find((account) => account.isSelected) ?? accessibleAccounts[0]

          if (selectedAccount) {
            customerId = selectedAccount.customerId
            connection = {
              ...connection,
              metadata: {
                ...connection.metadata,
                customerId,
                accountName: selectedAccount.displayName ?? connection.metadata.accountName,
                [providerProfile?.metadata.availableAccountsKey ??
                GOOGLE_ADS_PROVIDER_PROFILE.metadata.availableAccountsKey]:
                  JSON.stringify(accessibleAccounts),
              },
              updatedAt: nowIso(),
            }
            this.upsertConnection(connection)
          }
        } catch (error) {
          const mapped = mapRepositoryError(error)
          if (
            mapped.status === 401 ||
            mapped.status === 403 ||
            mapped.status === 500 ||
            mapped.status === 502
          ) {
            throw mapped
          }
        }
      }

      if (!customerId) {
        const connectorDisplayName = providerProfile?.displayName ?? "This connector"

        try {
          const connectionResponse = await this.client.get<GoogleActiveConnectionResponse>(
            providerProfile?.oauth.activeConnectionPath ??
              GOOGLE_ADS_PROVIDER_PROFILE.oauth.activeConnectionPath
          )

          if (
            providerProfile?.connectorId === "google_ads" &&
            connectionResponse.connection?.developerTokenConfigured === false
          ) {
            throw new ValidationError({
              code: "google_ads_developer_token_missing",
              message:
                "Google Ads developer token is missing on backend. Configure IDENTITY_PLATFORM_GOOGLE_ADS_DEVELOPER_TOKEN and reconnect.",
            })
          }
        } catch (error) {
          if (error instanceof ValidationError) {
            throw error
          }

          const mapped = mapRepositoryError(error)
          if (
            mapped.status === 401 ||
            mapped.status === 403 ||
            mapped.status === 500 ||
            mapped.status === 502
          ) {
            throw mapped
          }
        }

        throw new ValidationError({
          code: "connector_account_missing",
          message: `No accessible ${connectorDisplayName} account found. Connect or select an account first.`,
        })
      }

      const endDate = new Date()
      const startDate = new Date()
      startDate.setUTCDate(endDate.getUTCDate() - 7)

      const response = await this.client.post<
        {
          connectionId: string
          customerId: string
          startDate: string
          endDate: string
          idempotencyKey: string
          mode: "incremental"
          trigger: "manual" | "retry"
        },
        GoogleAdsSyncApiResponse
      >(
        providerProfile?.endpoints.sync ?? GOOGLE_ADS_PROVIDER_PROFILE.endpoints.sync,
        {
          connectionId: connection.connectionId,
          customerId,
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          idempotencyKey: generateUuid(),
          mode: "incremental",
          trigger: input.trigger === "retry" ? "retry" : "manual",
        },
        // Full-history syncs (walking years of paginated/report data, e.g. TikTok Ads'
        // 30-day-windowed insights) can legitimately take longer than the client's default
        // 15s timeout -- confirmed live: a real sync completing successfully server-side in
        // 12-16s still raced the default and sometimes lost. This only relaxes the wait for
        // this endpoint, not the default for every other request.
        { timeoutMs: 60_000 }
      )

      const run = this.mapSyncRun(connection.connectionId, response)
      const syncJob: SyncJob = {
        syncJobId: `sync_job_${connection.connectionId}`,
        connectionId: connection.connectionId,
        status: run.status,
        trigger: input.trigger ?? "manual",
        policy: {
          maxAttempts: 3,
          baseDelayMs: 250,
          backoffFactor: 2,
        },
        createdAt: nowIso(),
        updatedAt: nowIso(),
        latestRun: run,
      }

      const existingRuns = this.state.runs[connection.connectionId] ?? []
      this.state.runs[connection.connectionId] = [run, ...existingRuns].slice(0, 20)
      this.state.jobs[connection.connectionId] = syncJob

      const nextConnection: Connection = {
        ...connection,
        status: run.status === "failed" ? "error" : "connected",
        lastSyncedAt: run.finishedAt ?? nowIso(),
        updatedAt: nowIso(),
      }
      this.upsertConnection(nextConnection)
      this.persist()

      return run
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async scheduleSync(input: ScheduleSyncRequestDto): Promise<SyncSchedule> {
    const schedule: SyncSchedule = {
      scheduleId: `schedule_${input.connectionId}`,
      connectionId: input.connectionId,
      cron: input.cron || DEFAULT_CRON,
      timezone: input.timezone || DEFAULT_TIMEZONE,
      enabled: input.enabled ?? true,
      nextRunAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }

    return schedule
  }

  async retrySync(input: RetrySyncRequestDto): Promise<SyncRun> {
    const connectionId = input.syncJobId.replace(/^sync_job_/, "")
    const retryStatus = await this.fetchRetryStatus(connectionId)
    if (!retryStatus.available) {
      throw new ValidationError({
        code: "retry_not_available",
        message: "Retry is unavailable for the latest operation.",
      })
    }

    const response = await this.client.post<Record<string, never>, GoogleAdsSyncApiResponse>(
      GOOGLE_ADS_PROVIDER_PROFILE.endpoints.retry(connectionId),
      {}
    )

    const run = this.mapSyncRun(connectionId, response)
    const existingRuns = this.state.runs[connectionId] ?? []
    this.state.runs[connectionId] = [run, ...existingRuns].slice(0, 20)
    this.state.jobs[connectionId] = {
      syncJobId: `sync_job_${connectionId}`,
      connectionId,
      status: run.status,
      trigger: "retry",
      policy: { maxAttempts: 3, baseDelayMs: 250, backoffFactor: 2 },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      latestRun: run,
    }
    this.persist()

    return run
  }

  async pauseSync(input: PauseSyncRequestDto): Promise<SyncJob> {
    const connectionId = input.syncJobId.replace(/^sync_job_/, "")
    const connection = this.getConnectionOrThrow(connectionId)
    const providerProfile = resolveProviderProfileByConnection(connection)
    if (!providerProfile) {
      throw new ValidationError({
        code: "connector_not_supported",
        message: "Only Google Ads is available in production integration runtime.",
      })
    }

    await this.client.post<Record<string, never>, GoogleConnectionLifecycleResponse>(
      providerProfile.endpoints.pause(connectionId),
      {}
    )

    this.upsertConnection({
      ...connection,
      status: "paused",
      updatedAt: nowIso(),
    })

    const existing = this.state.jobs[connectionId]
    const job: SyncJob = {
      ...(existing ?? {
        syncJobId: input.syncJobId,
        connectionId,
        trigger: "manual",
        policy: { maxAttempts: 3, baseDelayMs: 250, backoffFactor: 2 },
        createdAt: nowIso(),
      }),
      status: "paused",
      updatedAt: nowIso(),
    }

    this.state.jobs[connectionId] = job
    this.persist()
    return job
  }

  async resumeSync(input: ResumeSyncRequestDto): Promise<SyncJob> {
    const connectionId = input.syncJobId.replace(/^sync_job_/, "")
    const connection = this.getConnectionOrThrow(connectionId)
    const providerProfile = resolveProviderProfileByConnection(connection)
    if (!providerProfile) {
      throw new ValidationError({
        code: "connector_not_supported",
        message: "Only Google Ads is available in production integration runtime.",
      })
    }

    await this.client.post<Record<string, never>, GoogleConnectionLifecycleResponse>(
      providerProfile.endpoints.resume(connectionId),
      {}
    )

    this.upsertConnection({
      ...connection,
      status: "connected",
      updatedAt: nowIso(),
    })

    const existing = this.state.jobs[connectionId]
    const job: SyncJob = {
      ...(existing ?? {
        syncJobId: input.syncJobId,
        connectionId,
        trigger: "manual",
        policy: { maxAttempts: 3, baseDelayMs: 250, backoffFactor: 2 },
        createdAt: nowIso(),
      }),
      status: "queued",
      updatedAt: nowIso(),
    }

    this.state.jobs[connectionId] = job
    this.persist()
    return job
  }

  async getIntegrationStatus(input: GetIntegrationStatusRequestDto): Promise<IntegrationStatusDto> {
    try {
      const connection = this.getConnectionOrThrow(input.connectionId)
      const latestJob = this.state.jobs[input.connectionId]
      const latestRun = (this.state.runs[input.connectionId] ?? [])[0]
      const recentEvents = await this.fetchTimelineEvents(input.connectionId).catch(() => [])
      const retryStatus = await this.fetchRetryStatus(input.connectionId).catch(() => null)
      const enrichedConnection = retryStatus
        ? {
            ...connection,
            metadata: {
              ...connection.metadata,
              retryAvailable: String(retryStatus.available),
              retryReason: retryStatus.reason,
              retryLastOperation: retryStatus.lastOperation
                ? JSON.stringify(retryStatus.lastOperation)
                : "",
            },
          }
        : connection

      return {
        connection: enrichedConnection,
        latestJob,
        latestRun,
        recentEvents,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getSyncHistory(input: GetSyncHistoryRequestDto): Promise<SyncHistoryDto> {
    try {
      const jobs = this.state.jobs[input.connectionId]
      const runs = this.state.runs[input.connectionId] ?? []

      return {
        connectionId: input.connectionId,
        jobs: jobs ? [jobs] : [],
        runs: input.limit ? runs.slice(0, input.limit) : runs,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getConnectorHealth(input: GetConnectorHealthRequestDto): Promise<ConnectorHealth> {
    try {
      traceFrontendExecution({
        step: "getConnectorHealth()",
        connectionCount: Object.keys(this.state.connections).length,
        details: `connectorId=${input.connectorId}`,
      })

      const connections = Object.values(this.state.connections).filter(
        (connection) => connection.connectorId === input.connectorId
      )

      const primary = connections[0]
      if (!primary) {
        return {
          connectorId: input.connectorId,
          status: "degraded",
          score: 0,
          lastCheckedAt: nowIso(),
          checks: [
            {
              check: "connection",
              status: "fail",
              message: "No backend connection found.",
            },
          ],
        }
      }

      const customerId = primary.metadata.customerId
      const primaryProviderProfile = resolveProviderProfileByConnection(primary)
      let hasData = false
      if (customerId && primaryProviderProfile) {
        hasData =
          (await this.fetchRecordCount(primaryProviderProfile, primary.connectionId, customerId)) >
          0
      }

      const latestRun = (this.state.runs[primary.connectionId] ?? [])[0]
      const failed = latestRun?.status === "failed"
      const hasCustomerSelection = Boolean(primary.metadata.customerId?.trim())

      const checks: ConnectorHealth["checks"] = [
        {
          check: "connection",
          status: primary.status === "connected" ? "pass" : "warn",
          message: `Connection status: ${primary.status}`,
        },
        {
          check: "records",
          status: hasCustomerSelection ? "pass" : "fail",
          message: hasData
            ? "Backend records available."
            : hasCustomerSelection
              ? "Sync completed successfully; no records found yet."
              : "Select an account to start syncing.",
        },
        {
          check: "latest_sync",
          status: failed ? "fail" : latestRun ? "pass" : "warn",
          message: failed
            ? (latestRun?.errorMessage ?? "Latest backend sync failed.")
            : latestRun
              ? "Latest backend sync completed."
              : "No sync run recorded yet.",
        },
      ]

      const status: ConnectorHealth["status"] = failed
        ? "unhealthy"
        : primary.status === "connected"
          ? "healthy"
          : "degraded"

      const score = failed
        ? 25
        : primary.status !== "connected"
          ? 40
          : hasCustomerSelection
            ? 100
            : 70

      return {
        connectorId: input.connectorId,
        status,
        score,
        lastCheckedAt: nowIso(),
        checks,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }
}

export const DataIntegrationRepository = RestIntegrationRepository

export function createIntegrationRepository(options?: {
  getSession?: () => AuthSessionDto | null
  getWorkspaceId?: () => string | null
}): IntegrationRepository {
  if (resolveRepositoryBackend("integration") === "mock") {
    return new InMemoryIntegrationRepository(options)
  }

  return new RestIntegrationRepository(options)
}

export function resetIntegrationRepositoryState() {
  resetInMemoryIntegrationRepositoryState()

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}
