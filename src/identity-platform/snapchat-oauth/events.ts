export interface SnapchatOAuthDomainEvent {
  eventType: string
  aggregateId: string
  actorUserId: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  occurredAt: string
  payload: Record<string, unknown>
}
