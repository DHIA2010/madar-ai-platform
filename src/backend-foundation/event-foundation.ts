export interface DomainEventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string
  eventType: string
  eventVersion: number
  aggregateType: string
  aggregateId: string
  occurredAt: string
  metadata: Record<string, unknown>
  payload: TPayload
}

export interface EventPublisher {
  publish(events: DomainEventEnvelope[]): Promise<void>
}

export interface EventSubscriber {
  handle(event: DomainEventEnvelope): Promise<void>
}

export interface DeadLetterPublisher {
  publish(event: DomainEventEnvelope, reason: string): Promise<void>
}

export interface RetryStrategy {
  nextDelayMs(attempt: number): number
  shouldRetry(attempt: number): boolean
}

export class ExponentialBackoffRetryStrategy implements RetryStrategy {
  constructor(
    private readonly maxAttempts = 5,
    private readonly baseDelayMs = 500,
    private readonly maxDelayMs = 30_000
  ) {}

  nextDelayMs(attempt: number) {
    return Math.min(this.baseDelayMs * 2 ** Math.max(0, attempt - 1), this.maxDelayMs)
  }

  shouldRetry(attempt: number) {
    return attempt < this.maxAttempts
  }
}

export function serializeEvent(event: DomainEventEnvelope) {
  return JSON.stringify(event)
}

export function deserializeEvent(raw: string): DomainEventEnvelope {
  return JSON.parse(raw) as DomainEventEnvelope
}
