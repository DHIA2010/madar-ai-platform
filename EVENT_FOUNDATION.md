# Event Foundation

## Objective
Consolidate event contracts and retry semantics while keeping implementation provider-independent.

## Source

- `src/backend-foundation/event-foundation.ts`
- existing outbox writer: `src/identity-platform/infrastructure/postgres/outbox-event-publisher.ts`

## Standardized Concepts

1. `DomainEventEnvelope`
2. `EventPublisher`
3. `EventSubscriber`
4. `DeadLetterPublisher`
5. `RetryStrategy`
6. `ExponentialBackoffRetryStrategy`
7. Event serialization / deserialization helpers

## Current Runtime State

- Identity writes durable outbox rows in PostgreSQL.
- Project service supports event publisher abstraction and defaults to in-memory.
- Subscriber and dead-letter processing are interface-ready, not yet fully orchestrated by a runtime worker in this sprint.

## Retry and Dead-letter Preparation

- Retry policy contract is now explicit.
- Dead-letter interface is defined to enable later durable DLQ implementation without breaking contracts.

## Next Steps

1. Build shared outbox dispatcher worker using foundation contracts.
2. Implement dead-letter persistence table and replay tooling.
3. Add end-to-end event contract tests per module.
