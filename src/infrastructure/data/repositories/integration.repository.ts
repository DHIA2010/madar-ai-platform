import type {
  AccessToken,
  AuthorizeConnectorRequestDto,
  CapabilityDiscoveryPort,
  Connection,
  ConnectorCapability,
  ConnectorConfigurationPort,
  ConnectorDefinition,
  ConnectorHealth,
  CreateConnectionRequestDto,
  Credential,
  CredentialStoragePort,
  DisconnectConnectionRequestDto,
  ErrorMapperPort,
  GetConnectorHealthRequestDto,
  GetIntegrationStatusRequestDto,
  GetSyncHistoryRequestDto,
  HealthMonitorPort,
  IntegrationEvent,
  IntegrationRepository,
  IntegrationStatusDto,
  PauseSyncRequestDto,
  RateLimit,
  RateLimitPort,
  RefreshConnectionRequestDto,
  RefreshToken,
  ResumeSyncRequestDto,
  RetryEnginePort,
  RetryPolicy,
  RetrySyncRequestDto,
  RunSyncRequestDto,
  ScheduleSyncRequestDto,
  SchedulerPort,
  SyncHistoryDto,
  SyncJob,
  SyncResult,
  SyncRun,
  SyncSchedule,
  TokenLifecyclePort,
  ValidateConnectionRequestDto,
  Webhook,
  WebhookPort,
} from "@/application/contracts/integration.contracts"
import { NotFoundError, ValidationError, mapRepositoryError } from "@/infrastructure/data/errors"
import { GA4_CONNECTOR_DEFINITION, GA4Repository } from "@/infrastructure/integration/ga4"
import {
  GOOGLE_ADS_CONNECTOR_DEFINITION,
  GoogleAdsRepository,
} from "@/infrastructure/integration/google-ads"
import {
  META_ADS_CONNECTOR_DEFINITION,
  MetaAdsRepository,
} from "@/infrastructure/integration/meta-ads"
import {
  TIKTOK_ADS_CONNECTOR_DEFINITION,
  TikTokAdsRepository,
} from "@/infrastructure/integration/tiktok-ads"
import {
  SNAPCHAT_ADS_CONNECTOR_DEFINITION,
  SnapchatAdsRepository,
} from "@/infrastructure/integration/snapchat-ads"
import { SallaRepository, SALLA_CONNECTOR_DEFINITION } from "@/infrastructure/integration/salla"
import { ZidRepository, ZID_CONNECTOR_DEFINITION } from "@/infrastructure/integration/zid"

const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  backoffFactor: 2,
}

const connectorDefinitions: ConnectorDefinition[] = [
  SALLA_CONNECTOR_DEFINITION,
  ZID_CONNECTOR_DEFINITION,
  GA4_CONNECTOR_DEFINITION,
  GOOGLE_ADS_CONNECTOR_DEFINITION,
  META_ADS_CONNECTOR_DEFINITION,
  TIKTOK_ADS_CONNECTOR_DEFINITION,
  SNAPCHAT_ADS_CONNECTOR_DEFINITION,
  {
    connectorDefinitionId: "connector_def_commerce_generic",
    key: "commerce.generic",
    displayName: "Generic Commerce Connector",
    description: "Reusable commerce connector definition template.",
    version: "1.0.0",
    capabilities: ["products", "orders", "customers", "catalog", "media"],
    supportsWebhook: true,
    supportsScheduler: true,
    supportsTokenRefresh: true,
  },
  {
    connectorDefinitionId: "connector_def_ads_generic",
    key: "ads.generic",
    displayName: "Generic Ads Connector",
    description: "Reusable ads connector definition template.",
    version: "1.0.0",
    capabilities: ["campaigns", "ads", "traffic", "events", "conversions"],
    supportsWebhook: false,
    supportsScheduler: true,
    supportsTokenRefresh: true,
  },
]

let connectionCounter = 0
let credentialCounter = 0
let webhookCounter = 0
let scheduleCounter = 0
let syncJobCounter = 0
let syncRunCounter = 0
let eventCounter = 0

const connections = new Map<string, Connection>()
const credentialsByConnection = new Map<string, Credential>()
const webhooksByConnection = new Map<string, Webhook>()
const schedulesByConnection = new Map<string, SyncSchedule>()
const jobs = new Map<string, SyncJob>()
const jobsByConnection = new Map<string, string[]>()
const runs = new Map<string, SyncRun>()
const runsByJob = new Map<string, string[]>()
const eventsByConnection = new Map<string, IntegrationEvent[]>()
const rateLimitState = new Map<string, RateLimit>()

function nowIso() {
  return new Date().toISOString()
}

function nextId(prefix: string, counter: number) {
  return `${prefix}_${String(counter).padStart(6, "0")}`
}

function nextConnectionId() {
  connectionCounter += 1
  return nextId("conn", connectionCounter)
}

function nextCredentialId() {
  credentialCounter += 1
  return nextId("cred", credentialCounter)
}

function nextWebhookId() {
  webhookCounter += 1
  return nextId("wh", webhookCounter)
}

function nextScheduleId() {
  scheduleCounter += 1
  return nextId("sched", scheduleCounter)
}

function nextSyncJobId() {
  syncJobCounter += 1
  return nextId("sync_job", syncJobCounter)
}

function nextSyncRunId() {
  syncRunCounter += 1
  return nextId("sync_run", syncRunCounter)
}

function nextEventId() {
  eventCounter += 1
  return nextId("int_evt", eventCounter)
}

function encryptPayload(payload: Record<string, string>) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64")
}

function connectionOrThrow(connectionId: string): Connection {
  const connection = connections.get(connectionId)
  if (!connection) {
    throw new NotFoundError({ message: `Connection ${connectionId} was not found.` })
  }
  return connection
}

function syncJobOrThrow(syncJobId: string): SyncJob {
  const job = jobs.get(syncJobId)
  if (!job) {
    throw new NotFoundError({ message: `Sync job ${syncJobId} was not found.` })
  }
  return job
}

function pushEvent(connectionId: string, action: IntegrationEvent["action"], message: string) {
  const list = eventsByConnection.get(connectionId) ?? []
  list.unshift({
    eventId: nextEventId(),
    connectionId,
    action,
    timestamp: nowIso(),
    actor: "system",
    message,
  })
  eventsByConnection.set(connectionId, list)
}

class InMemoryCredentialStore implements CredentialStoragePort {
  async store(
    connectionId: string,
    credential: CreateConnectionRequestDto["credential"]
  ): Promise<Credential | null> {
    if (!credential) {
      return null
    }

    const record: Credential = {
      credentialId: nextCredentialId(),
      connectionId,
      type: credential.type,
      encryptedPayload: encryptPayload(credential.payload),
      createdAt: nowIso(),
    }

    credentialsByConnection.set(connectionId, record)
    return record
  }

  async getByConnectionId(connectionId: string): Promise<Credential | null> {
    return credentialsByConnection.get(connectionId) ?? null
  }
}

class InMemoryTokenLifecycleService implements TokenLifecyclePort {
  async issue(
    connectionId: string
  ): Promise<{ accessToken: AccessToken; refreshToken: RefreshToken }> {
    const accessToken: AccessToken = {
      value: `access_${connectionId}_${Date.now()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }
    const refreshToken: RefreshToken = {
      value: `refresh_${connectionId}_${Date.now()}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }
    return { accessToken, refreshToken }
  }

  async refresh(connectionId: string): Promise<AccessToken> {
    return {
      value: `access_${connectionId}_${Date.now()}_refresh`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }
  }
}

class InMemoryWebhookService implements WebhookPort {
  async register(connectionId: string, events: string[]): Promise<Webhook> {
    const existing = webhooksByConnection.get(connectionId)
    const timestamp = nowIso()

    const webhook: Webhook = {
      webhookId: existing?.webhookId ?? nextWebhookId(),
      connectionId,
      endpoint: `https://mock.integration.local/hooks/${connectionId}`,
      secret: `whsec_${connectionId}`,
      events,
      active: true,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }

    webhooksByConnection.set(connectionId, webhook)
    return webhook
  }

  async deactivate(connectionId: string): Promise<void> {
    const existing = webhooksByConnection.get(connectionId)
    if (!existing) {
      return
    }

    webhooksByConnection.set(connectionId, {
      ...existing,
      active: false,
      updatedAt: nowIso(),
    })
  }
}

class InMemorySchedulerService implements SchedulerPort {
  async upsert(input: ScheduleSyncRequestDto): Promise<SyncSchedule> {
    const existing = schedulesByConnection.get(input.connectionId)
    const timestamp = nowIso()

    const schedule: SyncSchedule = {
      scheduleId: existing?.scheduleId ?? nextScheduleId(),
      connectionId: input.connectionId,
      cron: input.cron,
      timezone: input.timezone,
      enabled: input.enabled ?? true,
      nextRunAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }

    schedulesByConnection.set(input.connectionId, schedule)
    return schedule
  }

  async pause(syncJobId: string): Promise<void> {
    const job = syncJobOrThrow(syncJobId)
    jobs.set(syncJobId, {
      ...job,
      status: "paused",
      updatedAt: nowIso(),
    })
  }

  async resume(syncJobId: string): Promise<void> {
    const job = syncJobOrThrow(syncJobId)
    jobs.set(syncJobId, {
      ...job,
      status: "queued",
      updatedAt: nowIso(),
    })
  }
}

class DefaultRetryEngine implements RetryEnginePort {
  canRetry(run: SyncRun, policy: RetryPolicy): boolean {
    return run.status === "failed" && run.attempt < policy.maxAttempts
  }

  nextAttemptDelayMs(attempt: number, policy: RetryPolicy): number {
    return Math.floor(policy.baseDelayMs * Math.pow(policy.backoffFactor, Math.max(attempt - 1, 0)))
  }
}

class FixedWindowRateLimiter implements RateLimitPort {
  async consume(key: string): Promise<RateLimit> {
    const now = Date.now()
    const existing = rateLimitState.get(key)

    if (!existing || new Date(existing.resetAt).getTime() <= now) {
      const next: RateLimit = {
        key,
        limit: 100,
        windowMs: 60_000,
        remaining: 99,
        resetAt: new Date(now + 60_000).toISOString(),
      }
      rateLimitState.set(key, next)
      return next
    }

    const remaining = Math.max(existing.remaining - 1, 0)
    const next = {
      ...existing,
      remaining,
    }
    rateLimitState.set(key, next)
    return next
  }
}

class DefaultErrorMapper implements ErrorMapperPort {
  map(error: unknown): { code: string; message: string } {
    if (error instanceof ValidationError) {
      return { code: "validation_error", message: error.message }
    }
    if (error instanceof NotFoundError) {
      return { code: "not_found", message: error.message }
    }
    if (error instanceof Error) {
      return { code: "integration_error", message: error.message }
    }
    return { code: "integration_error", message: "Unknown integration error" }
  }
}

class DefaultHealthMonitor implements HealthMonitorPort {
  async evaluate(
    connectorId: string,
    connectorJobs: SyncJob[],
    connectorRuns: SyncRun[]
  ): Promise<ConnectorHealth> {
    const failed = connectorRuns.filter((run) => run.status === "failed").length
    const total = connectorRuns.length
    const failureRatio = total === 0 ? 0 : failed / total

    const throttled = connectorJobs.some((job) => (job.rateLimit?.remaining ?? 1) <= 0)

    const checks: ConnectorHealth["checks"] = [
      {
        check: "sync_failure_ratio",
        status: failureRatio > 0.4 ? "fail" : failureRatio > 0.15 ? "warn" : "pass",
        message: `Failure ratio ${failureRatio.toFixed(2)}`,
      },
      {
        check: "rate_limit_budget",
        status: throttled ? "warn" : "pass",
        message: throttled ? "Rate limit budget exhausted" : "Rate limit budget healthy",
      },
    ]

    const hasFail = checks.some((check) => check.status === "fail")
    const hasWarn = checks.some((check) => check.status === "warn")

    return {
      connectorId,
      status: hasFail ? "unhealthy" : hasWarn ? "degraded" : "healthy",
      score: hasFail ? 45 : hasWarn ? 72 : 96,
      lastCheckedAt: nowIso(),
      checks,
    }
  }
}

class StaticConnectorConfigurationService implements ConnectorConfigurationPort {
  async getDefinition(connectorDefinitionId: string): Promise<ConnectorDefinition | null> {
    return (
      connectorDefinitions.find((item) => item.connectorDefinitionId === connectorDefinitionId) ??
      null
    )
  }

  async listDefinitions(): Promise<ConnectorDefinition[]> {
    return connectorDefinitions.slice()
  }
}

class StaticCapabilityDiscoveryService implements CapabilityDiscoveryPort {
  async discover(connectorDefinitionId: string): Promise<ConnectorCapability[]> {
    const definition = connectorDefinitions.find(
      (item) => item.connectorDefinitionId === connectorDefinitionId
    )
    if (!definition) {
      return []
    }
    return definition.capabilities.slice()
  }
}

function deriveSyncResult(trigger: SyncJob["trigger"]): SyncResult {
  const timestamp = nowIso()

  if (trigger === "retry") {
    return {
      recordsRead: 80,
      recordsWritten: 75,
      recordsFailed: 5,
      durationMs: 2_100,
      startedAt: timestamp,
      finishedAt: timestamp,
      message: "Retry sync completed with partial recoveries.",
    }
  }

  return {
    recordsRead: 120,
    recordsWritten: 120,
    recordsFailed: 0,
    durationMs: 1_800,
    startedAt: timestamp,
    finishedAt: timestamp,
    message: "Sync completed successfully.",
  }
}

function updateConnection(connection: Connection): Connection {
  connections.set(connection.connectionId, connection)
  return connection
}

export class DataIntegrationRepository implements IntegrationRepository {
  constructor(
    private readonly credentialStorage: CredentialStoragePort = new InMemoryCredentialStore(),
    private readonly tokenLifecycle: TokenLifecyclePort = new InMemoryTokenLifecycleService(),
    private readonly webhookPort: WebhookPort = new InMemoryWebhookService(),
    private readonly schedulerPort: SchedulerPort = new InMemorySchedulerService(),
    private readonly retryEngine: RetryEnginePort = new DefaultRetryEngine(),
    private readonly rateLimitPort: RateLimitPort = new FixedWindowRateLimiter(),
    private readonly errorMapper: ErrorMapperPort = new DefaultErrorMapper(),
    private readonly healthMonitor: HealthMonitorPort = new DefaultHealthMonitor(),
    private readonly connectorConfiguration: ConnectorConfigurationPort = new StaticConnectorConfigurationService(),
    private readonly capabilityDiscovery: CapabilityDiscoveryPort = new StaticCapabilityDiscoveryService(),
    private readonly sallaRepository: SallaRepository = new SallaRepository(),
    private readonly zidRepository: ZidRepository = new ZidRepository(),
    private readonly ga4Repository: GA4Repository = new GA4Repository(),
    private readonly googleAdsRepository: GoogleAdsRepository = new GoogleAdsRepository(),
    private readonly metaAdsRepository: MetaAdsRepository = new MetaAdsRepository(),
    private readonly tikTokAdsRepository: TikTokAdsRepository = new TikTokAdsRepository(),
    private readonly snapchatAdsRepository: SnapchatAdsRepository = new SnapchatAdsRepository()
  ) {}

  async createConnection(input: CreateConnectionRequestDto): Promise<Connection> {
    try {
      const definition = await this.connectorConfiguration.getDefinition(
        input.connectorDefinitionId
      )
      if (!definition) {
        throw new NotFoundError({
          message: `Connector definition ${input.connectorDefinitionId} was not found.`,
        })
      }

      await this.capabilityDiscovery.discover(input.connectorDefinitionId)

      if (definition.connectorDefinitionId === SALLA_CONNECTOR_DEFINITION.connectorDefinitionId) {
        if (!input.credential || input.credential.type !== "oauth") {
          throw new ValidationError({
            message: "Salla connector requires OAuth credential payload.",
          })
        }
      }

      if (definition.connectorDefinitionId === ZID_CONNECTOR_DEFINITION.connectorDefinitionId) {
        if (!input.credential || input.credential.type !== "oauth") {
          throw new ValidationError({
            message: "Zid connector requires OAuth credential payload.",
          })
        }
      }

      if (definition.connectorDefinitionId === GA4_CONNECTOR_DEFINITION.connectorDefinitionId) {
        if (!input.credential || input.credential.type !== "oauth") {
          throw new ValidationError({
            message: "GA4 connector requires OAuth credential payload.",
          })
        }
      }

      if (
        definition.connectorDefinitionId === GOOGLE_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        if (!input.credential || input.credential.type !== "oauth") {
          throw new ValidationError({
            message: "Google Ads connector requires OAuth credential payload.",
          })
        }
      }

      if (
        definition.connectorDefinitionId === META_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        if (!input.credential || input.credential.type !== "oauth") {
          throw new ValidationError({
            message: "Meta Ads connector requires OAuth credential payload.",
          })
        }
      }

      if (
        definition.connectorDefinitionId === TIKTOK_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        if (!input.credential || input.credential.type !== "oauth") {
          throw new ValidationError({
            message: "TikTok Ads connector requires OAuth credential payload.",
          })
        }
      }

      if (
        definition.connectorDefinitionId === SNAPCHAT_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        if (!input.credential || input.credential.type !== "oauth") {
          throw new ValidationError({
            message: "Snapchat Ads connector requires OAuth credential payload.",
          })
        }
      }

      const timestamp = nowIso()
      const connectionId = nextConnectionId()

      const connection: Connection = {
        connectionId,
        workspaceId: input.workspaceId,
        connectorId: input.connectorId,
        connectorDefinitionId: input.connectorDefinitionId,
        status: "draft",
        metadata: input.metadata ?? {},
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      const storedCredential = await this.credentialStorage.store(connectionId, input.credential)
      if (storedCredential) {
        connection.credentialId = storedCredential.credentialId
      }

      updateConnection(connection)
      pushEvent(connectionId, "install", "Connection created and installed.")

      if (definition.supportsWebhook) {
        const webhookEvents =
          definition.connectorDefinitionId === SALLA_CONNECTOR_DEFINITION.connectorDefinitionId
            ? [
                "order.created",
                "order.updated",
                "customer.created",
                "product.updated",
                "inventory.updated",
              ]
            : definition.connectorDefinitionId === ZID_CONNECTOR_DEFINITION.connectorDefinitionId
              ? [
                  "order.created",
                  "order.updated",
                  "product.created",
                  "product.updated",
                  "inventory.updated",
                  "customer.created",
                ]
              : ["sync.completed", "sync.failed"]

        await this.webhookPort.register(connectionId, webhookEvents)
      }

      return connection
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async validateConnection(input: ValidateConnectionRequestDto): Promise<Connection> {
    try {
      const connection = connectionOrThrow(input.connectionId)

      if (connection.status === "deleted") {
        throw new ValidationError({ message: "Cannot validate a deleted connection." })
      }

      if (connection.connectorDefinitionId === SALLA_CONNECTOR_DEFINITION.connectorDefinitionId) {
        const tokenValid = await this.sallaRepository.validateToken(connection)
        if (!tokenValid) {
          throw new ValidationError({ message: "Salla access token is invalid or expired." })
        }
      }

      if (connection.connectorDefinitionId === ZID_CONNECTOR_DEFINITION.connectorDefinitionId) {
        const tokenValid = await this.zidRepository.validateToken(connection)
        if (!tokenValid) {
          throw new ValidationError({ message: "Zid access token is invalid or expired." })
        }
      }

      if (connection.connectorDefinitionId === GA4_CONNECTOR_DEFINITION.connectorDefinitionId) {
        const tokenValid = await this.ga4Repository.validateToken(connection)
        if (!tokenValid) {
          throw new ValidationError({ message: "GA4 access token is invalid or expired." })
        }
      }

      if (
        connection.connectorDefinitionId === GOOGLE_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        const tokenValid = await this.googleAdsRepository.validateToken(connection)
        if (!tokenValid) {
          throw new ValidationError({ message: "Google Ads access token is invalid or expired." })
        }
      }

      if (
        connection.connectorDefinitionId === META_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        const tokenValid = await this.metaAdsRepository.validateToken(connection)
        if (!tokenValid) {
          throw new ValidationError({ message: "Meta Ads access token is invalid or expired." })
        }
      }

      if (
        connection.connectorDefinitionId === TIKTOK_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        const tokenValid = await this.tikTokAdsRepository.validateToken(connection)
        if (!tokenValid) {
          throw new ValidationError({ message: "TikTok Ads access token is invalid or expired." })
        }
      }

      if (
        connection.connectorDefinitionId === SNAPCHAT_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        const tokenValid = await this.snapchatAdsRepository.validateToken(connection)
        if (!tokenValid) {
          throw new ValidationError({ message: "Snapchat Ads access token is invalid or expired." })
        }
      }

      const updated = updateConnection({
        ...connection,
        status: "valid",
        lastValidatedAt: nowIso(),
        updatedAt: nowIso(),
      })

      pushEvent(connection.connectionId, "validate", "Connection validation completed.")
      return updated
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async authorizeConnector(input: AuthorizeConnectorRequestDto): Promise<Connection> {
    try {
      const connection = connectionOrThrow(input.connectionId)

      const tokens =
        connection.connectorDefinitionId === SALLA_CONNECTOR_DEFINITION.connectorDefinitionId
          ? await this.sallaRepository.authorize(connection, input)
          : connection.connectorDefinitionId === ZID_CONNECTOR_DEFINITION.connectorDefinitionId
            ? await this.zidRepository.authorize(connection, input)
            : connection.connectorDefinitionId === GA4_CONNECTOR_DEFINITION.connectorDefinitionId
              ? await this.ga4Repository.authorize(connection, input)
              : connection.connectorDefinitionId ===
                  GOOGLE_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
                ? await this.googleAdsRepository.authorize(connection, input)
                : connection.connectorDefinitionId ===
                    META_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
                  ? await this.metaAdsRepository.authorize(connection, input)
                  : connection.connectorDefinitionId ===
                      TIKTOK_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
                    ? await this.tikTokAdsRepository.authorize(connection, input)
                    : connection.connectorDefinitionId ===
                        SNAPCHAT_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
                      ? await this.snapchatAdsRepository.authorize(connection, input)
                      : await this.tokenLifecycle.issue(connection.connectionId)

      const updated = updateConnection({
        ...connection,
        status: "authorized",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        updatedAt: nowIso(),
      })

      pushEvent(connection.connectionId, "authorize", "Connector authorized successfully.")
      return updated
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async refreshConnection(input: RefreshConnectionRequestDto): Promise<Connection> {
    try {
      const connection = connectionOrThrow(input.connectionId)

      if (!connection.refreshToken) {
        throw new ValidationError({ message: "Refresh token is missing for this connection." })
      }

      const refreshed =
        connection.connectorDefinitionId === SALLA_CONNECTOR_DEFINITION.connectorDefinitionId
          ? await this.sallaRepository.refresh(connection)
          : connection.connectorDefinitionId === ZID_CONNECTOR_DEFINITION.connectorDefinitionId
            ? await this.zidRepository.refresh(connection)
            : connection.connectorDefinitionId === GA4_CONNECTOR_DEFINITION.connectorDefinitionId
              ? await this.ga4Repository.refresh(connection)
              : connection.connectorDefinitionId ===
                  GOOGLE_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
                ? await this.googleAdsRepository.refresh(connection)
                : connection.connectorDefinitionId ===
                    META_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
                  ? await this.metaAdsRepository.refresh(connection)
                  : connection.connectorDefinitionId ===
                      TIKTOK_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
                    ? await this.tikTokAdsRepository.refresh(connection)
                    : connection.connectorDefinitionId ===
                        SNAPCHAT_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
                      ? await this.snapchatAdsRepository.refresh(connection)
                      : {
                          accessToken: await this.tokenLifecycle.refresh(
                            connection.connectionId,
                            connection.refreshToken
                          ),
                          refreshToken: connection.refreshToken,
                        }

      const updated = updateConnection({
        ...connection,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        updatedAt: nowIso(),
      })

      pushEvent(connection.connectionId, "refresh_token", "Access token refreshed.")
      return updated
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async disconnectConnection(input: DisconnectConnectionRequestDto): Promise<Connection> {
    try {
      const connection = connectionOrThrow(input.connectionId)

      if (connection.connectorDefinitionId === SALLA_CONNECTOR_DEFINITION.connectorDefinitionId) {
        await this.sallaRepository.disconnect()
      }

      if (connection.connectorDefinitionId === ZID_CONNECTOR_DEFINITION.connectorDefinitionId) {
        await this.zidRepository.disconnect()
      }

      if (connection.connectorDefinitionId === GA4_CONNECTOR_DEFINITION.connectorDefinitionId) {
        await this.ga4Repository.disconnect()
      }

      if (
        connection.connectorDefinitionId === GOOGLE_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        await this.googleAdsRepository.disconnect()
      }

      if (
        connection.connectorDefinitionId === META_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        await this.metaAdsRepository.disconnect()
      }

      if (
        connection.connectorDefinitionId === TIKTOK_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        await this.tikTokAdsRepository.disconnect()
      }

      if (
        connection.connectorDefinitionId === SNAPCHAT_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        await this.snapchatAdsRepository.disconnect()
      }

      await this.webhookPort.deactivate(connection.connectionId)

      const updated = updateConnection({
        ...connection,
        status: "disconnected",
        updatedAt: nowIso(),
      })

      pushEvent(connection.connectionId, "disconnect", input.reason ?? "Connection disconnected.")
      return updated
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async runSync(input: RunSyncRequestDto): Promise<SyncRun> {
    try {
      const connection = connectionOrThrow(input.connectionId)
      if (connection.status === "deleted") {
        throw new ValidationError({ message: "Cannot run sync for deleted connection." })
      }

      const trigger = input.trigger ?? "manual"
      const syncJobId = nextSyncJobId()
      const rateLimit = await this.rateLimitPort.consume(connection.connectorId)

      const syncJob: SyncJob = {
        syncJobId,
        connectionId: connection.connectionId,
        status: "running",
        trigger,
        policy: DEFAULT_POLICY,
        rateLimit,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }

      jobs.set(syncJobId, syncJob)
      jobsByConnection.set(connection.connectionId, [
        ...(jobsByConnection.get(connection.connectionId) ?? []),
        syncJobId,
      ])

      const sallaSyncOutput =
        connection.connectorDefinitionId === SALLA_CONNECTOR_DEFINITION.connectorDefinitionId
          ? await this.sallaRepository.runSync(connection, syncJob)
          : null

      const zidSyncOutput =
        connection.connectorDefinitionId === ZID_CONNECTOR_DEFINITION.connectorDefinitionId
          ? await this.zidRepository.runSync(connection, syncJob)
          : null
      const metaAdsSyncOutput =
        connection.connectorDefinitionId === META_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
          ? await this.metaAdsRepository.runSync(connection, syncJob)
          : null

      const tikTokAdsSyncOutput =
        connection.connectorDefinitionId === TIKTOK_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
          ? await this.tikTokAdsRepository.runSync(connection, syncJob)
          : null

      const snapchatAdsSyncOutput =
        connection.connectorDefinitionId === SNAPCHAT_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
          ? await this.snapchatAdsRepository.runSync(connection, syncJob)
          : null

      const googleAdsSyncOutput =
        connection.connectorDefinitionId === GOOGLE_ADS_CONNECTOR_DEFINITION.connectorDefinitionId
          ? await this.googleAdsRepository.runSync(connection, syncJob)
          : null

      const ga4SyncOutput =
        connection.connectorDefinitionId === GA4_CONNECTOR_DEFINITION.connectorDefinitionId
          ? await this.ga4Repository.runSync(connection, syncJob)
          : null

      if (
        trigger === "webhook" &&
        connection.connectorDefinitionId === SALLA_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        const rawWebhookEvent = connection.metadata.sallaWebhookEvent
        if (rawWebhookEvent) {
          this.sallaRepository.parseWebhook({
            event: rawWebhookEvent,
            data: {
              id: connection.metadata.sallaWebhookResourceId ?? connection.connectionId,
            },
            created_at: nowIso(),
          })
        }
      }

      if (
        trigger === "webhook" &&
        connection.connectorDefinitionId === ZID_CONNECTOR_DEFINITION.connectorDefinitionId
      ) {
        const rawWebhookEvent = connection.metadata.zidWebhookEvent
        if (rawWebhookEvent) {
          this.zidRepository.parseWebhook({
            event: rawWebhookEvent,
            data: {
              id: connection.metadata.zidWebhookResourceId ?? connection.connectionId,
            },
            created_at: nowIso(),
          })
        }
      }

      const result =
        sallaSyncOutput?.result ??
        googleAdsSyncOutput?.result ??
        ga4SyncOutput?.result ??
        metaAdsSyncOutput?.result ??
        tikTokAdsSyncOutput?.result ??
        snapchatAdsSyncOutput?.result ??
        zidSyncOutput?.result ??
        deriveSyncResult(trigger)
      const syncRun: SyncRun = {
        syncRunId: nextSyncRunId(),
        syncJobId,
        status: result.recordsFailed > 0 ? "failed" : "completed",
        attempt: 1,
        result,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
      }

      runs.set(syncRun.syncRunId, syncRun)
      runsByJob.set(syncJobId, [syncRun.syncRunId])

      jobs.set(syncJobId, {
        ...syncJob,
        status: "completed",
        latestRun: syncRun,
        updatedAt: nowIso(),
      })

      updateConnection({
        ...connection,
        status: "connected",
        lastSyncedAt: nowIso(),
        updatedAt: nowIso(),
      })

      if (sallaSyncOutput) {
        for (const integrationEvent of sallaSyncOutput.integrationEvents) {
          pushEvent(connection.connectionId, integrationEvent.action, integrationEvent.message)
        }
      }

      if (zidSyncOutput) {
        for (const integrationEvent of zidSyncOutput.integrationEvents) {
          pushEvent(connection.connectionId, integrationEvent.action, integrationEvent.message)
        }
      }

      if (ga4SyncOutput) {
        for (const integrationEvent of ga4SyncOutput.integrationEvents) {
          pushEvent(connection.connectionId, integrationEvent.action, integrationEvent.message)
        }
      }

      if (googleAdsSyncOutput) {
        for (const integrationEvent of googleAdsSyncOutput.integrationEvents) {
          pushEvent(connection.connectionId, integrationEvent.action, integrationEvent.message)
        }
      }

      if (metaAdsSyncOutput) {
        for (const integrationEvent of metaAdsSyncOutput.integrationEvents) {
          pushEvent(connection.connectionId, integrationEvent.action, integrationEvent.message)
        }
      }

      if (tikTokAdsSyncOutput) {
        for (const integrationEvent of tikTokAdsSyncOutput.integrationEvents) {
          pushEvent(connection.connectionId, integrationEvent.action, integrationEvent.message)
        }
      }

      if (snapchatAdsSyncOutput) {
        for (const integrationEvent of snapchatAdsSyncOutput.integrationEvents) {
          pushEvent(connection.connectionId, integrationEvent.action, integrationEvent.message)
        }
      }

      pushEvent(connection.connectionId, "sync", `Sync run ${syncRun.syncRunId} completed.`)
      return syncRun
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async scheduleSync(input: ScheduleSyncRequestDto): Promise<SyncSchedule> {
    try {
      connectionOrThrow(input.connectionId)
      const schedule = await this.schedulerPort.upsert(input)
      pushEvent(input.connectionId, "sync", `Sync schedule ${schedule.scheduleId} upserted.`)
      return schedule
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async retrySync(input: RetrySyncRequestDto): Promise<SyncRun> {
    try {
      const job = syncJobOrThrow(input.syncJobId)
      const previousRunIds = runsByJob.get(job.syncJobId) ?? []
      const previousRun =
        previousRunIds.length > 0 ? runs.get(previousRunIds[previousRunIds.length - 1]) : undefined

      const fallbackFailed: SyncRun = {
        syncRunId: nextSyncRunId(),
        syncJobId: job.syncJobId,
        status: "failed",
        attempt: 1,
        startedAt: nowIso(),
        finishedAt: nowIso(),
        errorCode: "simulated_failure",
        errorMessage: "Simulated failed run to allow retry flow.",
      }

      const baseline = previousRun ?? fallbackFailed
      const attempt = baseline.attempt + 1
      if (attempt > job.policy.maxAttempts) {
        throw new ValidationError({ message: "Retry policy does not allow another attempt." })
      }

      const canRetryFailedRun = this.retryEngine.canRetry(baseline, job.policy)
      if (baseline.status === "failed" && !canRetryFailedRun) {
        throw new ValidationError({ message: "Retry policy does not allow another attempt." })
      }

      const retryResult = deriveSyncResult("retry")
      const retryRun: SyncRun = {
        syncRunId: nextSyncRunId(),
        syncJobId: job.syncJobId,
        status: "completed",
        attempt,
        result: retryResult,
        startedAt: retryResult.startedAt,
        finishedAt: retryResult.finishedAt,
      }

      runs.set(retryRun.syncRunId, retryRun)
      runsByJob.set(job.syncJobId, [...previousRunIds, retryRun.syncRunId])
      jobs.set(job.syncJobId, {
        ...job,
        status: "completed",
        latestRun: retryRun,
        updatedAt: nowIso(),
      })

      pushEvent(job.connectionId, "sync", `Sync retry completed for job ${job.syncJobId}.`)
      return retryRun
    } catch (error) {
      const mapped = this.errorMapper.map(error)
      throw mapRepositoryError(new Error(`${mapped.code}: ${mapped.message}`))
    }
  }

  async pauseSync(input: PauseSyncRequestDto): Promise<SyncJob> {
    try {
      await this.schedulerPort.pause(input.syncJobId)
      const updated = syncJobOrThrow(input.syncJobId)
      pushEvent(updated.connectionId, "pause", `Sync job ${updated.syncJobId} paused.`)
      return updated
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async resumeSync(input: ResumeSyncRequestDto): Promise<SyncJob> {
    try {
      await this.schedulerPort.resume(input.syncJobId)
      const updated = syncJobOrThrow(input.syncJobId)
      pushEvent(updated.connectionId, "resume", `Sync job ${updated.syncJobId} resumed.`)
      return updated
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getIntegrationStatus(input: GetIntegrationStatusRequestDto): Promise<IntegrationStatusDto> {
    try {
      const connection = connectionOrThrow(input.connectionId)
      const jobIds = jobsByConnection.get(connection.connectionId) ?? []
      const latestJob = jobIds.length > 0 ? jobs.get(jobIds[jobIds.length - 1]) : undefined
      const latestRun = latestJob?.latestRun

      return {
        connection,
        latestJob,
        latestRun,
        recentEvents: (eventsByConnection.get(connection.connectionId) ?? []).slice(0, 10),
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getSyncHistory(input: GetSyncHistoryRequestDto): Promise<SyncHistoryDto> {
    try {
      connectionOrThrow(input.connectionId)
      const limit = input.limit ?? 50

      const jobIds = jobsByConnection.get(input.connectionId) ?? []
      const historyJobs = jobIds
        .map((jobId) => jobs.get(jobId))
        .filter((job): job is SyncJob => Boolean(job))
        .slice(-limit)

      const historyRuns = historyJobs
        .flatMap((job) => (runsByJob.get(job.syncJobId) ?? []).map((runId) => runs.get(runId)))
        .filter((run): run is SyncRun => Boolean(run))
        .slice(-limit)

      return {
        connectionId: input.connectionId,
        jobs: historyJobs,
        runs: historyRuns,
      }
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getConnectorHealth(input: GetConnectorHealthRequestDto): Promise<ConnectorHealth> {
    try {
      const connectorJobs = [...jobs.values()].filter((job) => {
        const connection = connections.get(job.connectionId)
        return connection?.connectorId === input.connectorId
      })

      const connectorRuns = connectorJobs.flatMap((job) =>
        (runsByJob.get(job.syncJobId) ?? [])
          .map((runId) => runs.get(runId))
          .filter((run): run is SyncRun => Boolean(run))
      )

      return this.healthMonitor.evaluate(input.connectorId, connectorJobs, connectorRuns)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }
}

export function createIntegrationRepository(): IntegrationRepository {
  return new DataIntegrationRepository()
}

export function resetIntegrationRepositoryState() {
  connectionCounter = 0
  credentialCounter = 0
  webhookCounter = 0
  scheduleCounter = 0
  syncJobCounter = 0
  syncRunCounter = 0
  eventCounter = 0

  connections.clear()
  credentialsByConnection.clear()
  webhooksByConnection.clear()
  schedulesByConnection.clear()
  jobs.clear()
  jobsByConnection.clear()
  runs.clear()
  runsByJob.clear()
  eventsByConnection.clear()
  rateLimitState.clear()
}
