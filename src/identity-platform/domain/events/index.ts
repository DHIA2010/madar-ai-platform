export interface DomainEvent {
  eventId: string
  eventType: string
  eventVersion: number
  aggregateType: string
  aggregateId: string
  occurredAt: string
  metadata: Record<string, string>
  payload: Record<string, unknown>
}
