# OUTBOX_PATTERN

## Purpose
The outbox pattern persists domain events transactionally in PostgreSQL so future asynchronous dispatch can be added without rewriting application logic.

## Implemented Components
- `outbox_events` table in `002_identity_production_foundation.sql`
- `src/identity-platform/infrastructure/postgres/outbox-event-publisher.ts`

## Event Shape
- `eventId`
- `eventType`
- `eventVersion`
- `aggregateType`
- `aggregateId`
- `occurredAt`
- `metadata`
- `payload`

## Current Behavior
- Application handlers publish versioned domain events.
- Production mode writes those events to the outbox table.
- Memory mode stores them through the in-memory publisher for tests.

## Future Ready For
- background dispatch workers
- retry policies
- replay
- dead-letter handling
- idempotent subscribers
