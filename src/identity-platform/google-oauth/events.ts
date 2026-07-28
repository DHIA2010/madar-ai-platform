export interface GoogleOAuthDomainEvent {
  eventType:
    | "google.oauth.authorization.started"
    | "google.oauth.authorization.completed"
    | "google.oauth.connection.disconnected"
  aggregateId: string
  actorUserId: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  occurredAt: string
  payload: Record<string, unknown>
}
