import type { ReadModel, ReadModelViewModel } from "./read-model.contracts"

export type ConnectorCapability =
  | "products"
  | "orders"
  | "customers"
  | "campaigns"
  | "ads"
  | "traffic"
  | "events"
  | "conversions"
  | "catalog"
  | "media"

export type ConnectorLifecycleAction =
  | "install"
  | "authorize"
  | "connect"
  | "validate"
  | "sync"
  | "refresh_token"
  | "pause"
  | "resume"
  | "disconnect"
  | "reconnect"
  | "delete"

export type ConnectionStatus =
  | "draft"
  | "authorized"
  | "connected"
  | "valid"
  | "syncing"
  | "paused"
  | "disconnected"
  | "deleted"
  | "error"

export type SyncJobStatus = "queued" | "running" | "completed" | "failed" | "paused" | "canceled"

export interface Integration {
  integrationId: string
  connectorId: string
  workspaceId: string
  createdAt: string
  updatedAt: string
}

export interface Connector {
  connectorId: string
  key: string
  name: string
  version: string
  enabled: boolean
  capabilities: ConnectorCapability[]
}

export interface ConnectorDefinition {
  connectorDefinitionId: string
  key: string
  displayName: string
  description: string
  version: string
  capabilities: ConnectorCapability[]
  supportsWebhook: boolean
  supportsScheduler: boolean
  supportsTokenRefresh: boolean
}

export interface Credential {
  credentialId: string
  connectionId: string
  type: "api_key" | "oauth" | "service_account"
  encryptedPayload: string
  createdAt: string
  rotatedAt?: string
}

export interface AccessToken {
  value: string
  expiresAt: string
}

export interface RefreshToken {
  value: string
  expiresAt?: string
}

export interface Connection {
  connectionId: string
  workspaceId: string
  connectorId: string
  connectorDefinitionId: string
  status: ConnectionStatus
  credentialId?: string
  accessToken?: AccessToken
  refreshToken?: RefreshToken
  metadata: Record<string, string>
  createdAt: string
  updatedAt: string
  lastValidatedAt?: string
  lastSyncedAt?: string
}

export interface Webhook {
  webhookId: string
  connectionId: string
  endpoint: string
  secret: string
  events: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  backoffFactor: number
}

export interface RateLimit {
  key: string
  limit: number
  windowMs: number
  remaining: number
  resetAt: string
}

export interface SyncSchedule {
  scheduleId: string
  connectionId: string
  cron: string
  timezone: string
  enabled: boolean
  nextRunAt?: string
  createdAt: string
  updatedAt: string
}

export interface SyncResult {
  recordsRead: number
  recordsWritten: number
  recordsFailed: number
  durationMs: number
  startedAt: string
  finishedAt: string
  message?: string
}

export interface SyncRun {
  syncRunId: string
  syncJobId: string
  status: SyncJobStatus
  attempt: number
  result?: SyncResult
  errorCode?: string
  errorMessage?: string
  startedAt: string
  finishedAt?: string
}

export interface SyncJob {
  syncJobId: string
  connectionId: string
  status: SyncJobStatus
  trigger: "manual" | "scheduled" | "webhook" | "retry"
  policy: RetryPolicy
  rateLimit?: RateLimit
  createdAt: string
  updatedAt: string
  latestRun?: SyncRun
}

export interface IntegrationEvent {
  eventId: string
  connectionId: string
  action: ConnectorLifecycleAction
  timestamp: string
  actor: "system" | "user"
  message: string
}

export interface ConnectorHealth {
  connectorId: string
  status: "healthy" | "degraded" | "unhealthy"
  score: number
  lastCheckedAt: string
  checks: Array<{ check: string; status: "pass" | "warn" | "fail"; message: string }>
}

export interface CreateConnectionRequestDto {
  workspaceId: string
  connectorDefinitionId: string
  connectorId: string
  metadata?: Record<string, string>
  credential?: {
    type: Credential["type"]
    payload: Record<string, string>
  }
}

export interface ValidateConnectionRequestDto {
  connectionId: string
}

export interface AuthorizeConnectorRequestDto {
  connectionId: string
  authorizationCode?: string
}

export interface RefreshConnectionRequestDto {
  connectionId: string
}

export interface DisconnectConnectionRequestDto {
  connectionId: string
  reason?: string
}

export interface RunSyncRequestDto {
  connectionId: string
  trigger?: SyncJob["trigger"]
}

export interface ScheduleSyncRequestDto {
  connectionId: string
  cron: string
  timezone: string
  enabled?: boolean
}

export interface RetrySyncRequestDto {
  syncJobId: string
}

export interface PauseSyncRequestDto {
  syncJobId: string
}

export interface ResumeSyncRequestDto {
  syncJobId: string
}

export interface GetIntegrationStatusRequestDto {
  connectionId: string
}

export interface GetSyncHistoryRequestDto {
  connectionId: string
  limit?: number
}

export interface GetConnectorHealthRequestDto {
  connectorId: string
}

export interface IntegrationStatusDto {
  connection: Connection
  latestJob?: SyncJob
  latestRun?: SyncRun
  recentEvents: IntegrationEvent[]
}

export interface SyncHistoryDto {
  connectionId: string
  jobs: SyncJob[]
  runs: SyncRun[]
}

export interface CredentialStoragePort {
  store(
    connectionId: string,
    credential: CreateConnectionRequestDto["credential"]
  ): Promise<Credential | null>
  getByConnectionId(connectionId: string): Promise<Credential | null>
}

export interface TokenLifecyclePort {
  issue(connectionId: string): Promise<{ accessToken: AccessToken; refreshToken: RefreshToken }>
  refresh(connectionId: string, refreshToken?: RefreshToken): Promise<AccessToken>
}

export interface WebhookPort {
  register(connectionId: string, events: string[]): Promise<Webhook>
  deactivate(connectionId: string): Promise<void>
}

export interface SchedulerPort {
  upsert(input: ScheduleSyncRequestDto): Promise<SyncSchedule>
  pause(syncJobId: string): Promise<void>
  resume(syncJobId: string): Promise<void>
}

export interface RetryEnginePort {
  canRetry(run: SyncRun, policy: RetryPolicy): boolean
  nextAttemptDelayMs(attempt: number, policy: RetryPolicy): number
}

export interface RateLimitPort {
  consume(key: string): Promise<RateLimit>
}

export interface ErrorMapperPort {
  map(error: unknown): { code: string; message: string }
}

export interface HealthMonitorPort {
  evaluate(connectorId: string, jobs: SyncJob[], runs: SyncRun[]): Promise<ConnectorHealth>
}

export interface ConnectorConfigurationPort {
  getDefinition(connectorDefinitionId: string): Promise<ConnectorDefinition | null>
  listDefinitions(): Promise<ConnectorDefinition[]>
}

export interface CapabilityDiscoveryPort {
  discover(connectorDefinitionId: string): Promise<ConnectorCapability[]>
}

export interface ConnectorContract {
  definition: ConnectorDefinition
  install(connection: Connection): Promise<void>
  authorize(connection: Connection, input: AuthorizeConnectorRequestDto): Promise<void>
  connect(connection: Connection): Promise<void>
  validate(connection: Connection): Promise<boolean>
  sync(connection: Connection, job: SyncJob): Promise<SyncResult>
  refreshToken(connection: Connection): Promise<AccessToken>
  pause(connection: Connection): Promise<void>
  resume(connection: Connection): Promise<void>
  disconnect(connection: Connection): Promise<void>
  reconnect(connection: Connection): Promise<void>
  delete(connection: Connection): Promise<void>
  getCapabilities(): ConnectorCapability[]
  getHealth(): Promise<ConnectorHealth>
}

export interface IntegrationRepository {
  createConnection(input: CreateConnectionRequestDto): Promise<Connection>
  validateConnection(input: ValidateConnectionRequestDto): Promise<Connection>
  authorizeConnector(input: AuthorizeConnectorRequestDto): Promise<Connection>
  refreshConnection(input: RefreshConnectionRequestDto): Promise<Connection>
  disconnectConnection(input: DisconnectConnectionRequestDto): Promise<Connection>
  runSync(input: RunSyncRequestDto): Promise<SyncRun>
  scheduleSync(input: ScheduleSyncRequestDto): Promise<SyncSchedule>
  retrySync(input: RetrySyncRequestDto): Promise<SyncRun>
  pauseSync(input: PauseSyncRequestDto): Promise<SyncJob>
  resumeSync(input: ResumeSyncRequestDto): Promise<SyncJob>
  getIntegrationStatus(input: GetIntegrationStatusRequestDto): Promise<IntegrationStatusDto>
  getSyncHistory(input: GetSyncHistoryRequestDto): Promise<SyncHistoryDto>
  getConnectorHealth(input: GetConnectorHealthRequestDto): Promise<ConnectorHealth>
}

export type IntegrationGateway = IntegrationRepository

export type IntegrationReadModel = ReadModel<IntegrationStatusDto>
export type IntegrationViewModel = ReadModelViewModel<IntegrationStatusDto>

export type ConnectorReadModel = ReadModel<ConnectorDefinition[]>
export type ConnectorViewModel = ReadModelViewModel<ConnectorDefinition[]>

export type ConnectionReadModel = ReadModel<Connection>
export type ConnectionViewModel = ReadModelViewModel<Connection>

export type SyncHistoryReadModel = ReadModel<SyncHistoryDto>
export type SyncHistoryViewModel = ReadModelViewModel<SyncHistoryDto>

export type SyncStatusReadModel = ReadModel<SyncRun>
export type SyncStatusViewModel = ReadModelViewModel<SyncRun>

export type ConnectorHealthReadModel = ReadModel<ConnectorHealth>
export type ConnectorHealthViewModel = ReadModelViewModel<ConnectorHealth>
