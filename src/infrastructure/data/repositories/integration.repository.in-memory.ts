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
  SyncRun,
  SyncSchedule,
  SyncJobStatus,
} from "@/application/contracts/integration.contracts"
import { NotFoundError, ValidationError } from "@/infrastructure/data/errors"

interface InMemoryState {
  connections: Record<string, Connection>
  jobs: Record<string, SyncJob>
  runs: Record<string, SyncRun[]>
  events: Record<string, IntegrationEvent[]>
}

const state: InMemoryState = {
  connections: {},
  jobs: {},
  runs: {},
  events: {},
}

const OAUTH_ONLY_CONNECTORS: Record<string, { label: string; accessPrefix: string; refreshPrefix: string }> = {
  connector_def_google_ads: {
    label: "Google Ads",
    accessPrefix: "google_ads_access_",
    refreshPrefix: "google_ads_refresh_",
  },
  connector_def_meta_ads: {
    label: "Meta Ads",
    accessPrefix: "meta_access_",
    refreshPrefix: "meta_refresh_",
  },
  connector_def_tiktok_ads: {
    label: "TikTok Ads",
    accessPrefix: "tiktok_ads_access_",
    refreshPrefix: "tiktok_ads_refresh_",
  },
  connector_def_snapchat_ads: {
    label: "Snapchat Ads",
    accessPrefix: "snapchat_ads_access_",
    refreshPrefix: "snapchat_ads_refresh_",
  },
  connector_def_ga4: {
    label: "GA4",
    accessPrefix: "ga4_access_",
    refreshPrefix: "ga4_refresh_",
  },
  connector_def_salla: {
    label: "Salla",
    accessPrefix: "salla_access_",
    refreshPrefix: "salla_refresh_",
  },
  connector_def_zid: {
    label: "Zid",
    accessPrefix: "zid_access_",
    refreshPrefix: "zid_refresh_",
  },
}

function nowIso() {
  return new Date().toISOString()
}

function generateUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`
}

function tokenFor(prefix: string) {
  return `${prefix}${generateUuid().replace(/-/g, "")}`
}

function getConnectorProfile(connectorDefinitionId: string) {
  return (
    OAUTH_ONLY_CONNECTORS[connectorDefinitionId] ?? {
      label: "Connector",
      accessPrefix: "access_",
      refreshPrefix: "refresh_",
    }
  )
}

function getConnectionOrThrow(connectionId: string) {
  const connection = state.connections[connectionId]
  if (!connection) {
    throw new NotFoundError({
      code: "connection_not_found",
      message: `Connection ${connectionId} was not found.`,
    })
  }

  return connection
}

function upsertConnection(connection: Connection) {
  state.connections[connection.connectionId] = connection
}

function toAction(status: SyncJobStatus): ConnectorLifecycleAction {
  if (status === "failed") {
    return "sync"
  }
  return "sync"
}

function appendEvent(connectionId: string, status: SyncJobStatus, message: string) {
  const event: IntegrationEvent = {
    eventId: generateUuid(),
    connectionId,
    action: toAction(status),
    timestamp: nowIso(),
    actor: "system",
    message,
  }

  const existing = state.events[connectionId] ?? []
  state.events[connectionId] = [event, ...existing].slice(0, 20)
}

function ensureOAuthPayload(input: CreateConnectionRequestDto) {
  const profile = OAUTH_ONLY_CONNECTORS[input.connectorDefinitionId]
  if (!profile) {
    return
  }

  if (input.credential?.type !== "oauth" || !input.credential.payload) {
    throw new ValidationError({
      code: "oauth_credential_required",
      message: `${profile.label} connector requires OAuth credential payload`,
    })
  }
}

function createConnectionTokenPair(connection: Connection) {
  const profile = getConnectorProfile(connection.connectorDefinitionId)
  return {
    accessToken: {
      value: tokenFor(profile.accessPrefix),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    refreshToken: {
      value: tokenFor(profile.refreshPrefix),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  }
}

export class InMemoryIntegrationRepository implements IntegrationRepository {
  constructor(_options?: {
    getSession?: () => AuthSessionDto | null
    getWorkspaceId?: () => string | null
  }) {}

  async createConnection(input: CreateConnectionRequestDto): Promise<Connection> {
    ensureOAuthPayload(input)

    const connectionId = `conn_${generateUuid()}`
    const connection: Connection = {
      connectionId,
      workspaceId: input.workspaceId,
      connectorId: input.connectorId,
      connectorDefinitionId: input.connectorDefinitionId,
      status: "draft",
      credentialId: input.credential ? `cred_${generateUuid()}` : undefined,
      metadata: { ...(input.metadata ?? {}) },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }

    upsertConnection(connection)
    return connection
  }

  async recoverConnections(): Promise<Connection[]> {
    return Object.values(state.connections)
  }

  async validateConnection(input: { connectionId: string }): Promise<Connection> {
    const connection = getConnectionOrThrow(input.connectionId)
    const next: Connection = {
      ...connection,
      status: "valid",
      lastValidatedAt: nowIso(),
      updatedAt: nowIso(),
    }
    upsertConnection(next)
    return next
  }

  async authorizeConnector(input: AuthorizeConnectorRequestDto): Promise<Connection> {
    const connection = getConnectionOrThrow(input.connectionId)
    const tokens = createConnectionTokenPair(connection)
    const next: Connection = {
      ...connection,
      status: "authorized",
      ...tokens,
      updatedAt: nowIso(),
    }
    upsertConnection(next)
    return next
  }

  async refreshConnection(input: RefreshConnectionRequestDto): Promise<Connection> {
    const connection = getConnectionOrThrow(input.connectionId)
    const profile = getConnectorProfile(connection.connectorDefinitionId)
    const next: Connection = {
      ...connection,
      status: connection.status === "disconnected" ? "connected" : connection.status,
      accessToken: {
        value: tokenFor(profile.accessPrefix),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      refreshToken:
        connection.refreshToken ?? {
          value: tokenFor(profile.refreshPrefix),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      updatedAt: nowIso(),
    }
    upsertConnection(next)
    return next
  }

  async disconnectConnection(input: DisconnectConnectionRequestDto): Promise<Connection> {
    const connection = getConnectionOrThrow(input.connectionId)
    const next: Connection = {
      ...connection,
      status: "disconnected",
      updatedAt: nowIso(),
    }
    upsertConnection(next)
    appendEvent(next.connectionId, "completed", input.reason ?? "Disconnected")
    return next
  }

  async deleteConnection(input: { connectionId: string }): Promise<void> {
    getConnectionOrThrow(input.connectionId)
    delete state.connections[input.connectionId]
    delete state.jobs[input.connectionId]
    delete state.runs[input.connectionId]
    delete state.events[input.connectionId]
  }

  async runSync(input: RunSyncRequestDto): Promise<SyncRun> {
    const connection = getConnectionOrThrow(input.connectionId)
    const syncJobId = state.jobs[connection.connectionId]?.syncJobId ?? `sync_job_${connection.connectionId}`
    const previousRuns = state.runs[connection.connectionId] ?? []
    const nonRetryRuns = previousRuns.filter((run) => run.attempt === 1).length
    const attempt = input.trigger === "retry" ? (previousRuns[0]?.attempt ?? 1) + 1 : 1

    const profile = getConnectorProfile(connection.connectorDefinitionId)
    const phase = nonRetryRuns === 0 ? "initial" : "incremental"
    const isWebhook = input.trigger === "webhook"

    const recordsRead = isWebhook ? 24 : phase === "initial" ? 120 : 48
    const recordsWritten = Math.max(1, recordsRead - 2)

    const run: SyncRun = {
      syncRunId: `sync_run_${generateUuid()}`,
      syncJobId,
      status: "completed",
      attempt,
      result: {
        recordsRead,
        recordsWritten,
        recordsFailed: 0,
        durationMs: isWebhook ? 420 : phase === "initial" ? 980 : 610,
        startedAt: nowIso(),
        finishedAt: nowIso(),
        message: isWebhook
          ? `${profile.label} webhook sync completed`
          : `${profile.label} ${phase} sync completed`,
      },
      startedAt: nowIso(),
      finishedAt: nowIso(),
    }

    const job: SyncJob = {
      syncJobId,
      connectionId: connection.connectionId,
      status: run.status,
      trigger: input.trigger ?? "manual",
      policy: {
        maxAttempts: 3,
        baseDelayMs: 250,
        backoffFactor: 2,
      },
      createdAt: state.jobs[connection.connectionId]?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      latestRun: run,
    }

    state.jobs[connection.connectionId] = job
    state.runs[connection.connectionId] = [run, ...previousRuns].slice(0, 20)

    const nextConnection: Connection = {
      ...connection,
      status: "connected",
      lastSyncedAt: run.finishedAt,
      updatedAt: nowIso(),
    }
    upsertConnection(nextConnection)

    appendEvent(connection.connectionId, run.status, run.result?.message ?? "Sync completed")
    return run
  }

  async scheduleSync(input: ScheduleSyncRequestDto): Promise<SyncSchedule> {
    return {
      scheduleId: `schedule_${input.connectionId}`,
      connectionId: input.connectionId,
      cron: input.cron,
      timezone: input.timezone,
      enabled: input.enabled ?? true,
      nextRunAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
  }

  async retrySync(input: RetrySyncRequestDto): Promise<SyncRun> {
    const connectionId = input.syncJobId.replace(/^sync_job_/, "")
    return this.runSync({ connectionId, trigger: "retry" })
  }

  async pauseSync(input: PauseSyncRequestDto): Promise<SyncJob> {
    const connectionId = input.syncJobId.replace(/^sync_job_/, "")
    const existing = state.jobs[connectionId]
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

    state.jobs[connectionId] = job
    return job
  }

  async resumeSync(input: ResumeSyncRequestDto): Promise<SyncJob> {
    const connectionId = input.syncJobId.replace(/^sync_job_/, "")
    const existing = state.jobs[connectionId]
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

    state.jobs[connectionId] = job
    return job
  }

  async getIntegrationStatus(input: GetIntegrationStatusRequestDto): Promise<IntegrationStatusDto> {
    const connection = getConnectionOrThrow(input.connectionId)
    const latestJob = state.jobs[input.connectionId]
    const latestRun = (state.runs[input.connectionId] ?? [])[0]

    return {
      connection,
      latestJob,
      latestRun,
      recentEvents: state.events[input.connectionId] ?? [],
    }
  }

  async getSyncHistory(input: GetSyncHistoryRequestDto): Promise<SyncHistoryDto> {
    const jobs = state.jobs[input.connectionId]
    const runs = state.runs[input.connectionId] ?? []

    return {
      connectionId: input.connectionId,
      jobs: jobs ? [jobs] : [],
      runs: input.limit ? runs.slice(0, input.limit) : runs,
    }
  }

  async getConnectorHealth(input: GetConnectorHealthRequestDto): Promise<ConnectorHealth> {
    const connections = Object.values(state.connections).filter(
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
            message: "No connection found.",
          },
        ],
      }
    }

    const latestRun = (state.runs[primary.connectionId] ?? [])[0]
    const failed = latestRun?.status === "failed"

    return {
      connectorId: input.connectorId,
      status: failed ? "unhealthy" : primary.status === "connected" ? "healthy" : "degraded",
      score: failed ? 35 : primary.status === "connected" ? 100 : 70,
      lastCheckedAt: nowIso(),
      checks: [
        {
          check: "connection",
          status: primary.status === "connected" ? "pass" : "warn",
          message: `Connection status: ${primary.status}`,
        },
        {
          check: "latest_sync",
          status: latestRun ? (failed ? "fail" : "pass") : "warn",
          message: latestRun?.result?.message ?? "No sync run recorded yet.",
        },
      ],
    }
  }
}

export function resetInMemoryIntegrationRepositoryState() {
  state.connections = {}
  state.jobs = {}
  state.runs = {}
  state.events = {}
}
