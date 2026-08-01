export interface GoogleOAuthDomainEvent {
  eventType:
    | "google.oauth.authorization.started"
    | "google.oauth.authorization.completed"
    | "google.oauth.connection.reconnected"
    | "google.oauth.connection.paused"
    | "google.oauth.connection.resumed"
    | "google.oauth.connection.disconnected"
    | "google.oauth.connection.deleted"
    | "google.oauth.connection.reconnect.started"
    | "google.oauth.token.refreshed"
    | "google.ads.sync.retry"
    | "google.ads.sync.started"
    | "google.ads.sync.completed"
    | "google.ads.sync.failed"
  aggregateId: string
  actorUserId: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  occurredAt: string
  payload: Record<string, unknown>
}
