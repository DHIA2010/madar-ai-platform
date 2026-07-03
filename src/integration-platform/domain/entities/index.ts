import { randomUUID } from "node:crypto"

import { INTEGRATION_ERRORS } from "../../application/errors/IntegrationPlatformError"
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

export interface TimestampedState {
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ConnectorCapabilityState {
  key: string
  name: string
  enabled: boolean
  description?: string
}

export interface ConnectorState extends TimestampedState {
  id: string
  connectorId: string
  displayName: string
  description: string
  version: string
  status: ConnectorStatus
  capabilities: ConnectorCapabilityState[]
  configuration: Record<string, unknown>
}

export interface ConnectionState extends TimestampedState {
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
}

export interface CredentialState extends TimestampedState {
  id: string
  connectionId: string
  status: CredentialStatus
  version: number
  secretCiphertext: string
  secretMetadata: Record<string, unknown>
  revokedAt: string | null
  rotatedAt: string | null
}

export interface OAuthSessionState extends TimestampedState {
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
}

export interface OAuthTokenState extends TimestampedState {
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
}

export interface SyncJobState extends TimestampedState {
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
}

export interface WebhookRegistrationState extends TimestampedState {
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
}

export interface ConnectorHealthState extends TimestampedState {
  id: string
  connectorId: string
  connectionId: string | null
  status: HealthStatus
  message: string
  retryCount: number
  lastSyncedAt: string | null
  nextSyncAt: string | null
  metadata: Record<string, unknown>
}

export interface ConnectorConfigurationState extends TimestampedState {
  id: string
  connectorId: string
  connectionId: string | null
  version: number
  configuration: Record<string, unknown>
  status: "draft" | "validated" | "active" | "archived"
}

export function createConnector(
  input: Omit<ConnectorState, "createdAt" | "updatedAt" | "deletedAt">
): ConnectorState {
  return {
    ...input,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createConnection(
  input: Omit<
    ConnectionState,
    | "status"
    | "credentialId"
    | "oauthSessionId"
    | "providerAccountId"
    | "providerEmail"
    | "lastSyncedAt"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
  >
): ConnectionState {
  return {
    ...input,
    status: "draft",
    credentialId: null,
    oauthSessionId: null,
    providerAccountId: null,
    providerEmail: null,
    lastSyncedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createCredential(
  input: Omit<
    CredentialState,
    "status" | "revokedAt" | "rotatedAt" | "createdAt" | "updatedAt" | "deletedAt"
  >
): CredentialState {
  return {
    ...input,
    status: "active",
    revokedAt: null,
    rotatedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createOAuthSession(
  input: Omit<OAuthSessionState, "status" | "createdAt" | "updatedAt" | "deletedAt">
): OAuthSessionState {
  if (!input.state.trim()) throw INTEGRATION_ERRORS.invalidState("OAuth state is required.")
  return {
    ...input,
    status: "pending",
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function completeOAuthSession(
  session: OAuthSessionState,
  input: { providerAccountId?: string | null; providerAccountEmail?: string | null; now?: string }
) {
  return {
    ...session,
    status: "completed" as const,
    providerAccountId: input.providerAccountId ?? null,
    providerAccountEmail: input.providerAccountEmail ?? null,
    updatedAt: input.now ?? new Date().toISOString(),
  }
}

export function failOAuthSession(
  session: OAuthSessionState,
  message: string,
  now = new Date().toISOString()
) {
  return {
    ...session,
    status: "failed" as const,
    updatedAt: now,
    deletedAt: session.deletedAt,
    expiresAt: session.expiresAt,
    state: session.state,
  }
}

export function createOAuthToken(
  input: Omit<OAuthTokenState, "status" | "createdAt" | "updatedAt" | "deletedAt">
): OAuthTokenState {
  return {
    ...input,
    status: "active",
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function revokeOAuthToken(token: OAuthTokenState, now = new Date().toISOString()) {
  return { ...token, status: "revoked" as const, updatedAt: now }
}

export function createSyncJob(
  input: Omit<
    SyncJobState,
    | "progress"
    | "retryCount"
    | "status"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
    | "lastError"
    | "startedAt"
    | "completedAt"
  >
): SyncJobState {
  return {
    ...input,
    progress: 0,
    retryCount: 0,
    status: "queued",
    lastError: null,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function updateSyncJobProgress(
  job: SyncJobState,
  progress: number,
  now = new Date().toISOString()
) {
  return { ...job, progress: Math.max(0, Math.min(100, progress)), updatedAt: now }
}

export function completeSyncJob(job: SyncJobState, now = new Date().toISOString()) {
  return { ...job, status: "completed" as const, progress: 100, completedAt: now, updatedAt: now }
}

export function failSyncJob(job: SyncJobState, error: string, now = new Date().toISOString()) {
  return {
    ...job,
    status: "failed" as const,
    lastError: error,
    retryCount: job.retryCount + 1,
    updatedAt: now,
  }
}

export function cancelSyncJob(job: SyncJobState, reason: string, now = new Date().toISOString()) {
  return {
    ...job,
    status: "canceled" as const,
    lastError: reason,
    completedAt: now,
    updatedAt: now,
  }
}

export function createWebhookRegistration(
  input: Omit<
    WebhookRegistrationState,
    "status" | "lastVerifiedAt" | "createdAt" | "updatedAt" | "deletedAt"
  >
): WebhookRegistrationState {
  return {
    ...input,
    status: "active",
    lastVerifiedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function revokeWebhookRegistration(
  registration: WebhookRegistrationState,
  now = new Date().toISOString()
) {
  return { ...registration, status: "revoked" as const, deletedAt: now, updatedAt: now }
}

export function createConnectorHealth(
  input: Omit<ConnectorHealthState, "createdAt" | "updatedAt" | "deletedAt">
): ConnectorHealthState {
  return {
    ...input,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createConnectorConfiguration(
  input: Omit<
    ConnectorConfigurationState,
    "createdAt" | "updatedAt" | "deletedAt" | "version" | "status"
  >
): ConnectorConfigurationState {
  return {
    ...input,
    version: 1,
    status: "draft",
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
