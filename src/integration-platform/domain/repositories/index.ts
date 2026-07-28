import type {
  ConnectionStatus,
  ConnectorStatus,
  CredentialStatus,
  HealthStatus,
  OAuthSessionStatus,
  OAuthTokenStatus,
  SyncJobStatus,
  WebhookStatus,
} from "../../types"

export interface ConnectorState {
  id: string
  connectorId: string
  displayName: string
  description: string
  version: string
  status: ConnectorStatus
  capabilities: Array<{ key: string; name: string; enabled: boolean; description?: string }>
  configuration: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ConnectionState {
  id: string
  connectorId: string
  organizationId: string
  workspaceId: string | null
  projectId: string | null
  status: ConnectionStatus
  credentialId: string | null
  oauthSessionId: string | null
  providerAccountId: string | null
  providerEmail: string | null
  capabilities: string[]
  metadata: Record<string, unknown>
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface CredentialState {
  id: string
  connectionId: string
  status: CredentialStatus
  version: number
  secretCiphertext: string
  secretMetadata: Record<string, unknown>
  revokedAt: string | null
  rotatedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface OAuthSessionState {
  id: string
  connectorId: string
  connectionId: string
  state: string
  codeVerifier: string | null
  codeChallenge: string | null
  redirectUri: string
  scopes: string[]
  status: OAuthSessionStatus
  expiresAt: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface OAuthTokenState {
  id: string
  connectionId: string
  providerAccountId: string | null
  providerEmail: string | null
  accessTokenCiphertext: string
  refreshTokenCiphertext: string | null
  tokenType: string
  scopes: string[]
  expiresAt: string | null
  issuedAt: string
  status: OAuthTokenStatus
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface SyncJobState {
  id: string
  connectionId: string
  connectorId: string
  mode: "full" | "incremental"
  status: SyncJobStatus
  progress: number
  retryCount: number
  maxRetries: number
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  nextAttemptAt: string | null
  lastError: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface WebhookRegistrationState {
  id: string
  connectorId: string
  connectionId: string
  endpointUrl: string
  secretCiphertext: string
  signatureHeader: string
  replayWindowSeconds: number
  status: WebhookStatus
  lastVerifiedAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ConnectorHealthState {
  id: string
  connectorId: string
  connectionId: string | null
  status: HealthStatus
  message: string
  retryCount: number
  lastSyncedAt: string | null
  nextSyncAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ConnectorConfigurationState {
  id: string
  connectorId: string
  connectionId: string | null
  version: number
  configuration: Record<string, unknown>
  status: "draft" | "validated" | "active" | "archived"
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ConnectorRepository {
  findById(id: string): Promise<ConnectorState | null>
  findByConnectorId(connectorId: string): Promise<ConnectorState | null>
  list(): Promise<ConnectorState[]>
  save(connector: ConnectorState): Promise<void>
}

export interface ConnectionRepository {
  findById(id: string): Promise<ConnectionState | null>
  listByOrganizationId(organizationId: string): Promise<ConnectionState[]>
  listByWorkspaceId(workspaceId: string): Promise<ConnectionState[]>
  listByConnectorId(connectorId: string): Promise<ConnectionState[]>
  save(connection: ConnectionState): Promise<void>
}

export interface CredentialRepository {
  findById(id: string): Promise<CredentialState | null>
  findLatestByConnectionId(connectionId: string): Promise<CredentialState | null>
  save(credential: CredentialState): Promise<void>
}

export interface OAuthSessionRepository {
  findById(id: string): Promise<OAuthSessionState | null>
  findByState(state: string): Promise<OAuthSessionState | null>
  listByConnectionId(connectionId: string): Promise<OAuthSessionState[]>
  save(session: OAuthSessionState): Promise<void>
}

export interface OAuthTokenRepository {
  findById(id: string): Promise<OAuthTokenState | null>
  findLatestByCredentialId(credentialId: string): Promise<OAuthTokenState | null>
  save(token: OAuthTokenState): Promise<void>
}

export interface SyncJobRepository {
  findById(id: string): Promise<SyncJobState | null>
  listByConnectionId(connectionId: string): Promise<SyncJobState[]>
  save(job: SyncJobState): Promise<void>
}

export interface WebhookRegistrationRepository {
  findById(id: string): Promise<WebhookRegistrationState | null>
  listByConnectionId(connectionId: string): Promise<WebhookRegistrationState[]>
  save(registration: WebhookRegistrationState): Promise<void>
}

export interface ConnectorHealthRepository {
  findById(id: string): Promise<ConnectorHealthState | null>
  findLatestByConnectorId(connectorId: string): Promise<ConnectorHealthState | null>
  save(health: ConnectorHealthState): Promise<void>
}

export interface ConnectorConfigurationRepository {
  findById(id: string): Promise<ConnectorConfigurationState | null>
  listByConnectorId(connectorId: string): Promise<ConnectorConfigurationState[]>
  save(configuration: ConnectorConfigurationState): Promise<void>
}

export interface IntegrationRepositories {
  connectors: ConnectorRepository
  connections: ConnectionRepository
  credentials: CredentialRepository
  oauthSessions: OAuthSessionRepository
  oauthTokens: OAuthTokenRepository
  syncJobs: SyncJobRepository
  webhookRegistrations: WebhookRegistrationRepository
  connectorHealth: ConnectorHealthRepository
  connectorConfigurations: ConnectorConfigurationRepository
}
