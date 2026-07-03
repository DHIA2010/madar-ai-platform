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
    developerTokenConfigured?: boolean
    customerAccounts: Array<{ customerId: string; displayName: string | null; isSelected: boolean }>
  } | null
}

interface StoredState {
  connections: Record<string, Connection>
  jobs: Record<string, SyncJob>
  runs: Record<string, SyncRun[]>
  events: Record<string, IntegrationEvent[]>
}

const STORAGE_KEY = "integration-runtime-state:v1"
const GOOGLE_ADS_CONNECTOR_ID = "google_ads"
const GOOGLE_ADS_CONNECTOR_DEFINITION_ID = "connector_def_google_ads"
const DEFAULT_WORKSPACE_ID = "ws_connections_center"
const DEFAULT_CRON = "*/30 * * * *"
const DEFAULT_TIMEZONE = "Asia/Riyadh"

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

function toAction(status: SyncJobStatus): ConnectorLifecycleAction {
  if (status === "failed") {
    return "sync"
  }

  return "sync"
}

function loadState(): StoredState {
  if (typeof window === "undefined") {
    return { connections: {}, jobs: {}, runs: {}, events: {} }
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return { connections: {}, jobs: {}, runs: {}, events: {} }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>
    return {
      connections: parsed.connections ?? {},
      jobs: parsed.jobs ?? {},
      runs: parsed.runs ?? {},
      events: parsed.events ?? {},
    }
  } catch {
    return { connections: {}, jobs: {}, runs: {}, events: {} }
  }
}

function saveState(state: StoredState) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function readOAuthCallback(): {
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
  const oauthStatus = params.get("google_oauth")

  return {
    status: oauthStatus === "connected" || oauthStatus === "error" ? oauthStatus : null,
    connectionId: params.get("google_connection_id"),
    accountName: params.get("google_account_name"),
    accountEmail: params.get("google_account_email"),
    reason: params.get("reason"),
  }
}

function parseStoredGoogleAdsAccounts(raw: string | undefined) {
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

function normalizeGoogleAdsAccounts(items: Array<Record<string, unknown>>) {
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

  private appendEvent(connectionId: string, status: SyncJobStatus, message: string) {
    const event: IntegrationEvent = {
      eventId: generateUuid(),
      connectionId,
      action: toAction(status),
      timestamp: nowIso(),
      actor: "system",
      message,
    }

    const existing = this.state.events[connectionId] ?? []
    this.state.events[connectionId] = [event, ...existing].slice(0, 20)
    this.persist()
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

  private async fetchRecordCount(connectionId: string, customerId: string) {
    traceFrontendExecution({
      step: "getRecords()",
      connectionId,
      customerId,
      connectionCount: Object.keys(this.state.connections).length,
    })

    const response = await this.client.get<{ items: GoogleAdsRecordItem[] }>(
      "/v1/integrations/google-ads/records",
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

  private async fetchAccessibleAccounts(connectionId: string) {
    const response = await this.client.get<{ items: Array<Record<string, unknown>> }>(
      "/v1/integrations/google-ads/accounts",
      {
        query: {
          connectionId,
        },
      }
    )

    return normalizeGoogleAdsAccounts(response.items)
  }

  async createConnection(input: CreateConnectionRequestDto): Promise<Connection> {
    try {
      if (input.connectorDefinitionId !== GOOGLE_ADS_CONNECTOR_DEFINITION_ID) {
        throw new ValidationError({
          code: "connector_not_supported",
          message: "Only Google Ads is available in production integration runtime.",
        })
      }

      const start = await this.client.post<
        { workspaceId?: string | null; projectId?: string | null; connectionName?: string | null },
        GoogleOAuthStartResponse
      >("/v1/integrations/google/oauth/start", {
        workspaceId: input.workspaceId,
        projectId: null,
        connectionName: input.metadata?.connectionName ?? input.metadata?.accountName ?? null,
      })

      const connection: Connection = {
        connectionId: start.connectionId,
        workspaceId: input.workspaceId ?? start.workspaceId ?? DEFAULT_WORKSPACE_ID,
        connectorId: GOOGLE_ADS_CONNECTOR_ID,
        connectorDefinitionId: GOOGLE_ADS_CONNECTOR_DEFINITION_ID,
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

  async recoverConnections(): Promise<Connection[]> {
    try {
      const backendResponse = await this.client.get<GoogleActiveConnectionResponse>(
        "/v1/integrations/google/connection"
      )
      const backendConn = backendResponse.connection

      if (!backendConn || backendConn.status !== "connected") {
        return []
      }

      const existing = this.state.connections[backendConn.id]
      const accounts = backendConn.customerAccounts ?? []
      const selectedAccount = accounts.find((a) => a.isSelected) ?? accounts[0] ?? null

      const recovered: Connection = {
        connectionId: backendConn.id,
        workspaceId:
          existing?.workspaceId ?? this.options?.getWorkspaceId?.() ?? DEFAULT_WORKSPACE_ID,
        connectorId: GOOGLE_ADS_CONNECTOR_ID,
        connectorDefinitionId: GOOGLE_ADS_CONNECTOR_DEFINITION_ID,
        status: "connected",
        metadata: {
          ...(existing?.metadata ?? {}),
          accountName:
            selectedAccount?.displayName ??
            backendConn.providerAccountName ??
            existing?.metadata.accountName ??
            "Google Ads Account",
          accountEmail: backendConn.providerAccountEmail ?? existing?.metadata.accountEmail ?? "",
          customerId: selectedAccount?.customerId ?? existing?.metadata.customerId ?? "",
          availableGoogleAdsCustomerAccounts: JSON.stringify(accounts),
        },
        createdAt: existing?.createdAt ?? nowIso(),
        updatedAt: nowIso(),
        lastValidatedAt: nowIso(),
      }

      for (const [connectionId, connection] of Object.entries(this.state.connections)) {
        if (
          connection.connectorDefinitionId === GOOGLE_ADS_CONNECTOR_DEFINITION_ID &&
          connectionId !== backendConn.id &&
          connection.status === "draft"
        ) {
          delete this.state.connections[connectionId]
        }
      }

      this.upsertConnection(recovered)
      return [recovered]
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async validateConnection(input: { connectionId: string }): Promise<Connection> {
    try {
      const current = this.getConnectionOrThrow(input.connectionId)
      const callback = readOAuthCallback()

      if (callback.status === "connected" && callback.connectionId === input.connectionId) {
        let accessibleAccounts: GoogleAdsAccessibleAccountApiItem[] = []
        try {
          const response = await this.client.get<{ items: Array<Record<string, unknown>> }>(
            "/v1/integrations/google-ads/accounts",
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
            availableGoogleAdsCustomerAccounts: JSON.stringify(accessibleAccounts),
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
            customerAccounts: Array<{
              customerId: string
              displayName: string | null
              isSelected: boolean
            }>
          } | null
        }>("/v1/integrations/google/connection")

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
              availableGoogleAdsCustomerAccounts: JSON.stringify(accounts),
            },
            updatedAt: nowIso(),
            lastValidatedAt: nowIso(),
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

  async authorizeConnector(input: AuthorizeConnectorRequestDto): Promise<Connection> {
    try {
      const connection = this.getConnectionOrThrow(input.connectionId)
      const authorizationUrl = connection.metadata.oauthAuthorizationUrl

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
      const next: Connection = {
        ...connection,
        status: "disconnected",
        updatedAt: nowIso(),
      }

      this.upsertConnection(next)
      this.appendEvent(connection.connectionId, "completed", input.reason ?? "Disconnected")
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
      delete this.state.events[input.connectionId]
      this.persist()
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async runSync(input: RunSyncRequestDto): Promise<SyncRun> {
    try {
      let connection = this.getConnectionOrThrow(input.connectionId)
      let customerId = connection.metadata.customerId?.trim() ?? ""

      if (!customerId) {
        const availableAccounts = parseStoredGoogleAdsAccounts(
          connection.metadata.availableGoogleAdsCustomerAccounts
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
          const accessibleAccounts = await this.fetchAccessibleAccounts(connection.connectionId)
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
                availableGoogleAdsCustomerAccounts: JSON.stringify(accessibleAccounts),
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
        try {
          const connectionResponse = await this.client.get<GoogleActiveConnectionResponse>(
            "/v1/integrations/google/connection"
          )

          if (connectionResponse.connection?.developerTokenConfigured === false) {
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
          code: "google_ads_customer_id_missing",
          message: "No accessible Google Ads account found. Connect or select an account first.",
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
        },
        GoogleAdsSyncApiResponse
      >("/v1/integrations/google-ads/sync", {
        connectionId: connection.connectionId,
        customerId,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        idempotencyKey: generateUuid(),
        mode: "incremental",
      })

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

      this.appendEvent(
        connection.connectionId,
        run.status,
        run.errorMessage ?? run.result?.message ?? "Sync completed"
      )
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
    return this.runSync({ connectionId, trigger: "retry" })
  }

  async pauseSync(input: PauseSyncRequestDto): Promise<SyncJob> {
    const connectionId = input.syncJobId.replace(/^sync_job_/, "")
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

      return {
        connection,
        latestJob,
        latestRun,
        recentEvents: this.state.events[input.connectionId] ?? [],
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
      let hasData = false
      if (customerId) {
        hasData = (await this.fetchRecordCount(primary.connectionId, customerId)) > 0
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
          status: hasData ? "pass" : hasCustomerSelection ? "warn" : "fail",
          message: hasData
            ? "Backend records available."
            : hasCustomerSelection
              ? "No backend records found yet."
              : "Select a Google Ads account to start syncing.",
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
          : hasData
            ? 100
            : hasCustomerSelection
              ? 85
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
