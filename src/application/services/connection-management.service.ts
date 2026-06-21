import type {
  AuthorizeConnectorRequestDto,
  Connection,
  CreateConnectionRequestDto,
  DisconnectConnectionRequestDto,
  GetIntegrationStatusRequestDto,
  IntegrationGateway,
  RunSyncRequestDto,
  ScheduleSyncRequestDto,
  SyncRun,
  ValidateConnectionRequestDto,
} from "../contracts"
import { createReadModel } from "../read-models"

export type ConnectionLifecycleState =
  | "connecting"
  | "connected"
  | "refreshing"
  | "disconnected"
  | "expired"
  | "paused"
  | "error"
  | "revoked"

export interface ConnectionState {
  connectionId: string
  connectorId: string
  connectorDefinitionId: string
  state: ConnectionLifecycleState
  updatedAt: string
  reason?: string
}

export type ConnectionHealthStatus = "healthy" | "degraded" | "unhealthy"

export interface ConnectionHealth {
  connectionId: string
  lastSyncAt?: string
  nextSyncAt?: string
  lastSuccessfulSyncAt?: string
  lastFailedSyncAt?: string
  averageSyncDurationMs: number
  retryCount: number
  status: ConnectionHealthStatus
  updatedAt: string
}

export type ConnectionHistoryEventType =
  | "connection_created"
  | "connected"
  | "disconnected"
  | "token_refreshed"
  | "sync_started"
  | "sync_completed"
  | "sync_failed"
  | "webhook_triggered"
  | "configuration_updated"

export interface ConnectionHistoryEvent {
  eventType: ConnectionHistoryEventType
  timestamp: string
  message: string
  metadata?: Record<string, string>
}

export interface ConnectionHistory {
  connectionId: string
  events: ConnectionHistoryEvent[]
}

export interface RetryQueueItem {
  syncJobId: string
  connectionId: string
  attempt: number
  nextRunAt: string
}

export interface ConnectionScheduler {
  connectionId: string
  manualSyncCount: number
  scheduledSyncCount: number
  webhookTriggerCount: number
  retryQueue: RetryQueueItem[]
  backoffStrategy: {
    baseDelayMs: number
    factor: number
  }
}

export interface ConnectionRegistryEntry {
  connectorDefinitionId: string
  connectorId: string
  firstConnectionId: string
  firstRegisteredAt: string
}

export interface ConnectionRegistry {
  connectors: ConnectionRegistryEntry[]
}

export interface ConnectionMetrics {
  connectionId: string
  uptimeRatio: number
  syncSuccessRate: number
  averageDurationMs: number
  failureRate: number
  lastActivityAt?: string
}

export interface ConnectionMetricsReadModelPayload {
  metrics: ConnectionMetrics
}

function nowIso() {
  return new Date().toISOString()
}

function toLifecycleState(connection: Connection): ConnectionLifecycleState {
  switch (connection.status) {
    case "draft":
      return "connecting"
    case "authorized":
    case "connected":
    case "valid":
    case "syncing":
      return "connected"
    case "paused":
      return "paused"
    case "disconnected":
      return "disconnected"
    case "deleted":
      return "revoked"
    case "error":
      return "error"
    default:
      return "connecting"
  }
}

function withDefaultHealth(connectionId: string): ConnectionHealth {
  return {
    connectionId,
    averageSyncDurationMs: 0,
    retryCount: 0,
    status: "healthy",
    updatedAt: nowIso(),
  }
}

function withDefaultScheduler(connectionId: string): ConnectionScheduler {
  return {
    connectionId,
    manualSyncCount: 0,
    scheduledSyncCount: 0,
    webhookTriggerCount: 0,
    retryQueue: [],
    backoffStrategy: {
      baseDelayMs: 500,
      factor: 2,
    },
  }
}

export class ConnectionManager {
  private readonly states = new Map<string, ConnectionState>()
  private readonly health = new Map<string, ConnectionHealth>()
  private readonly history = new Map<string, ConnectionHistory>()
  private readonly schedulers = new Map<string, ConnectionScheduler>()
  private readonly registry = new Map<string, ConnectionRegistryEntry>()

  private readonly syncDurations = new Map<string, number[]>()
  private readonly syncSuccessCounts = new Map<string, { success: number; failure: number }>()
  private readonly connectedAt = new Map<string, string>()
  private readonly lastActivity = new Map<string, string>()

  constructor(private readonly integrationGateway: IntegrationGateway) {}

  private trackActivity(connectionId: string) {
    const ts = nowIso()
    this.lastActivity.set(connectionId, ts)
    return ts
  }

  private pushHistory(
    connectionId: string,
    eventType: ConnectionHistoryEventType,
    message: string,
    metadata?: Record<string, string>
  ) {
    const existing = this.history.get(connectionId) ?? { connectionId, events: [] }
    existing.events.unshift({
      eventType,
      timestamp: nowIso(),
      message,
      metadata,
    })
    this.history.set(connectionId, existing)
    this.trackActivity(connectionId)
  }

  private setState(connection: Connection, state?: ConnectionLifecycleState, reason?: string) {
    this.states.set(connection.connectionId, {
      connectionId: connection.connectionId,
      connectorId: connection.connectorId,
      connectorDefinitionId: connection.connectorDefinitionId,
      state: state ?? toLifecycleState(connection),
      updatedAt: nowIso(),
      reason,
    })

    if ((state ?? toLifecycleState(connection)) === "connected") {
      this.connectedAt.set(connection.connectionId, nowIso())
    }
  }

  private ensureHealth(connectionId: string): ConnectionHealth {
    const existing = this.health.get(connectionId)
    if (existing) {
      return existing
    }

    const next = withDefaultHealth(connectionId)
    this.health.set(connectionId, next)
    return next
  }

  private ensureScheduler(connectionId: string): ConnectionScheduler {
    const existing = this.schedulers.get(connectionId)
    if (existing) {
      return existing
    }

    const next = withDefaultScheduler(connectionId)
    this.schedulers.set(connectionId, next)
    return next
  }

  private registerConnector(connection: Connection) {
    if (!this.registry.has(connection.connectorDefinitionId)) {
      this.registry.set(connection.connectorDefinitionId, {
        connectorDefinitionId: connection.connectorDefinitionId,
        connectorId: connection.connectorId,
        firstConnectionId: connection.connectionId,
        firstRegisteredAt: nowIso(),
      })
    }
  }

  private updateSyncCounters(connectionId: string, run: SyncRun) {
    const counts = this.syncSuccessCounts.get(connectionId) ?? { success: 0, failure: 0 }
    if (run.status === "completed") {
      counts.success += 1
    } else {
      counts.failure += 1
    }
    this.syncSuccessCounts.set(connectionId, counts)

    const duration = run.result?.durationMs ?? 0
    const durations = this.syncDurations.get(connectionId) ?? []
    durations.push(duration)
    this.syncDurations.set(connectionId, durations)

    const health = this.ensureHealth(connectionId)
    const avg =
      durations.length > 0 ? durations.reduce((sum, entry) => sum + entry, 0) / durations.length : 0
    const now = nowIso()

    health.lastSyncAt = now
    health.averageSyncDurationMs = avg
    health.updatedAt = now

    if (run.status === "completed") {
      health.lastSuccessfulSyncAt = now
      if (!health.lastFailedSyncAt) {
        health.status = "healthy"
      } else {
        const ratio = counts.failure / (counts.success + counts.failure)
        health.status = ratio > 0.4 ? "unhealthy" : ratio > 0.2 ? "degraded" : "healthy"
      }
    } else {
      health.lastFailedSyncAt = now
      const ratio = counts.failure / (counts.success + counts.failure)
      health.status = ratio > 0.4 ? "unhealthy" : "degraded"
    }

    this.health.set(connectionId, health)
  }

  private enqueueRetry(connectionId: string, syncJobId: string) {
    const scheduler = this.ensureScheduler(connectionId)
    const nextAttempt = scheduler.retryQueue.length + 1
    const delay =
      scheduler.backoffStrategy.baseDelayMs *
      Math.pow(scheduler.backoffStrategy.factor, nextAttempt - 1)
    scheduler.retryQueue.push({
      syncJobId,
      connectionId,
      attempt: nextAttempt,
      nextRunAt: new Date(Date.now() + delay).toISOString(),
    })
    this.schedulers.set(connectionId, scheduler)

    const health = this.ensureHealth(connectionId)
    health.retryCount += 1
    health.updatedAt = nowIso()
    this.health.set(connectionId, health)
  }

  async createConnection(input: CreateConnectionRequestDto): Promise<Connection> {
    const connection = await this.integrationGateway.createConnection(input)

    this.registerConnector(connection)
    this.setState(connection, "connecting")
    this.ensureHealth(connection.connectionId)
    this.ensureScheduler(connection.connectionId)

    this.pushHistory(connection.connectionId, "connection_created", "Connection created")
    this.pushHistory(
      connection.connectionId,
      "configuration_updated",
      "Connection configuration initialized"
    )

    return connection
  }

  async connect(
    input: AuthorizeConnectorRequestDto & ValidateConnectionRequestDto
  ): Promise<Connection> {
    const authorized = await this.integrationGateway.authorizeConnector({
      connectionId: input.connectionId,
      authorizationCode: input.authorizationCode,
    })

    this.setState(authorized, "connected")
    this.pushHistory(authorized.connectionId, "connected", "Connection authorized and connected")

    const validated = await this.integrationGateway.validateConnection({
      connectionId: input.connectionId,
    })

    this.setState(validated, "connected")
    return validated
  }

  async refreshConnection(input: { connectionId: string }) {
    const state = this.states.get(input.connectionId)
    if (state) {
      this.states.set(input.connectionId, {
        ...state,
        state: "refreshing",
        updatedAt: nowIso(),
      })
    }

    const refreshed = await this.integrationGateway.refreshConnection(input)
    this.setState(refreshed, "connected")
    this.pushHistory(refreshed.connectionId, "token_refreshed", "Connection token refreshed")

    return refreshed
  }

  async disconnectConnection(input: DisconnectConnectionRequestDto): Promise<Connection> {
    const disconnected = await this.integrationGateway.disconnectConnection(input)
    this.setState(disconnected, "disconnected", input.reason)
    this.pushHistory(
      disconnected.connectionId,
      "disconnected",
      input.reason ?? "Connection disconnected"
    )
    return disconnected
  }

  async runSync(input: RunSyncRequestDto): Promise<SyncRun> {
    const scheduler = this.ensureScheduler(input.connectionId)
    if (input.trigger === "manual") {
      scheduler.manualSyncCount += 1
    }
    if (input.trigger === "scheduled") {
      scheduler.scheduledSyncCount += 1
    }
    if (input.trigger === "webhook") {
      scheduler.webhookTriggerCount += 1
      this.pushHistory(input.connectionId, "webhook_triggered", "Webhook triggered sync")
    }
    this.schedulers.set(input.connectionId, scheduler)

    this.pushHistory(
      input.connectionId,
      "sync_started",
      `Sync started (${input.trigger ?? "manual"})`
    )

    try {
      const run = await this.integrationGateway.runSync(input)
      this.updateSyncCounters(input.connectionId, run)
      this.pushHistory(input.connectionId, "sync_completed", `Sync completed: ${run.syncRunId}`)
      return run
    } catch (error) {
      const statusInput: GetIntegrationStatusRequestDto = { connectionId: input.connectionId }
      const status = await this.integrationGateway.getIntegrationStatus(statusInput)
      this.setState(
        status.connection,
        "error",
        error instanceof Error ? error.message : "sync_error"
      )
      this.pushHistory(input.connectionId, "sync_failed", "Sync failed")
      if (status.latestJob) {
        this.enqueueRetry(input.connectionId, status.latestJob.syncJobId)
      }
      throw error
    }
  }

  async scheduleSync(input: ScheduleSyncRequestDto) {
    const schedule = await this.integrationGateway.scheduleSync(input)
    const health = this.ensureHealth(input.connectionId)
    health.nextSyncAt = schedule.nextRunAt
    health.updatedAt = nowIso()
    this.health.set(input.connectionId, health)

    this.pushHistory(input.connectionId, "configuration_updated", "Sync schedule updated")
    return schedule
  }

  async pauseSync(syncJobId: string): Promise<void> {
    const job = await this.integrationGateway.pauseSync({ syncJobId })
    const status = await this.integrationGateway.getIntegrationStatus({
      connectionId: job.connectionId,
    })
    this.setState(status.connection, "paused")
  }

  async resumeSync(syncJobId: string): Promise<void> {
    const job = await this.integrationGateway.resumeSync({ syncJobId })
    const status = await this.integrationGateway.getIntegrationStatus({
      connectionId: job.connectionId,
    })
    this.setState(status.connection, "connected")
  }

  async runRetryQueue(connectionId: string): Promise<SyncRun[]> {
    const scheduler = this.ensureScheduler(connectionId)
    const runs: SyncRun[] = []
    const queue = scheduler.retryQueue.slice()
    scheduler.retryQueue = []
    this.schedulers.set(connectionId, scheduler)

    for (const item of queue) {
      const run = await this.integrationGateway.retrySync({ syncJobId: item.syncJobId })
      this.updateSyncCounters(connectionId, run)
      runs.push(run)
    }

    return runs
  }

  getState(connectionId: string): ConnectionState | null {
    return this.states.get(connectionId) ?? null
  }

  getHealth(connectionId: string): ConnectionHealth | null {
    return this.health.get(connectionId) ?? null
  }

  getHistory(connectionId: string): ConnectionHistory | null {
    return this.history.get(connectionId) ?? null
  }

  getScheduler(connectionId: string): ConnectionScheduler | null {
    return this.schedulers.get(connectionId) ?? null
  }

  getRegistry(): ConnectionRegistry {
    return {
      connectors: [...this.registry.values()],
    }
  }

  getMetrics(connectionId: string): ConnectionMetrics | null {
    const counts = this.syncSuccessCounts.get(connectionId)
    const durations = this.syncDurations.get(connectionId)

    if (!counts || !durations) {
      return null
    }

    const total = counts.success + counts.failure
    const averageDurationMs =
      durations.length > 0 ? durations.reduce((sum, entry) => sum + entry, 0) / durations.length : 0

    const connectedAt = this.connectedAt.get(connectionId)
    const uptimeRatio = connectedAt
      ? Math.min((Date.now() - new Date(connectedAt).getTime()) / 86_400_000, 1)
      : 0

    return {
      connectionId,
      uptimeRatio,
      syncSuccessRate: total > 0 ? counts.success / total : 0,
      averageDurationMs,
      failureRate: total > 0 ? counts.failure / total : 0,
      lastActivityAt: this.lastActivity.get(connectionId),
    }
  }

  getMetricsReadModel(connectionId: string) {
    const metrics = this.getMetrics(connectionId)
    if (!metrics) {
      return null
    }

    return createReadModel<ConnectionMetricsReadModelPayload>({
      id: `connection-metrics:${connectionId}`,
      owner: "integrations",
      sourceDomains: ["integrations"],
      payload: {
        metrics,
      },
    })
  }
}
