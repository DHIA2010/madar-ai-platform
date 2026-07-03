export type ConnectorStatus = "active" | "disabled" | "archived" | "deleted"
export type ConnectionStatus =
  | "draft"
  | "oauth_pending"
  | "connected"
  | "disconnected"
  | "error"
  | "deleted"
export type CredentialStatus = "active" | "rotating" | "revoked" | "deleted"
export type OAuthSessionStatus = "pending" | "completed" | "failed" | "expired"
export type OAuthTokenStatus = "active" | "expired" | "revoked"
export type SyncJobStatus = "queued" | "running" | "completed" | "failed" | "canceled"
export type SyncMode = "full" | "incremental"
export type WebhookStatus = "active" | "disabled" | "revoked"
export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown"

export interface OAuthProviderConfiguration {
  authorizationUrl: string
  tokenUrl: string
  revocationUrl?: string
  clientId: string
  redirectUri: string
  scopes: string[]
  usePkce?: boolean
  offlineAccess?: boolean
}
