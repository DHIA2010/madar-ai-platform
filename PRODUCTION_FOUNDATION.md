# PRODUCTION_FOUNDATION

## Sprint 3.2 Purpose
Sprint 3.2 completes the backend production foundation by replacing temporary adapters with production-ready implementations while preserving current domain behavior and current REST behavior.

## Implemented Foundation Summary
- Async-safe repository and provider contracts.
- PostgreSQL database abstraction with pooling, transactions, health checks, and migration runner.
- PostgreSQL repositories for durable identity records and audit persistence.
- Redis-backed session repository, cache provider, and distributed rate limiter.
- SMTP-backed email provider with safe local fallback.
- Local storage provider abstraction.
- Outbox-backed domain event publisher.
- Environment-backed feature flag and configuration providers.
- Infrastructure-aware health, readiness, and liveness endpoints.
- Expanded identity test suite covering repositories, Redis adapters, outbox, providers, and migration validation.

## Required Contract Change Review

### Problem
The current repository and provider contracts in `src/identity-platform/domain/repositories` and `src/identity-platform/application/ports` are synchronous.

This blocks correct production implementations for:
- PostgreSQL repositories
- Redis repositories
- Outbox persistence
- Health checks that depend on real infrastructure
- Transactional persistence around event storage

### Why This Cannot Stay Synchronous
Node PostgreSQL and Redis drivers are inherently asynchronous.

Keeping synchronous contracts would force one of these unacceptable options:
- fake production adapters that do not actually perform network I/O
- blocking wrappers around async clients
- hidden background writes that break consistency guarantees
- transport-layer workarounds that leak infrastructure concerns back into the application layer

### Proposed Change
Convert repository and provider contracts to async `Promise`-based contracts.

This includes:
- repository interfaces
- infrastructure provider interfaces that touch external systems
- command handlers
- query handlers
- REST server adapter call sites

### What Will Not Change
- Domain rules
- Request and response shapes
- Use-case semantics
- Endpoint contracts
- Canonical architecture direction from Sprint 3.1

### Compatibility Strategy
- Preserve external REST behavior.
- Preserve existing DTO shapes.
- Preserve current handler responsibilities.
- Keep compatibility wrappers where useful, but make internal execution async-safe.

### Decision
Proceed with async contract conversion because it clearly improves architecture and is required to support production-ready PostgreSQL, Redis, and outbox implementations without violating separation of concerns.

## Required Domain Event Contract Review

### Problem
The current `DomainEvent` contract only contains:
- `name`
- `occurredAt`
- `payload`

This is insufficient for:
- outbox persistence
- event versioning
- idempotency tracking
- aggregate correlation
- replay safety
- future subscriber evolution

### Proposed Change
Expand internal event contracts to include metadata such as:
- `eventId`
- `eventType`
- `eventVersion`
- `aggregateType`
- `aggregateId`
- `occurredAt`
- `metadata`
- `payload`

### What Will Not Change
- Domain behavior
- REST behavior
- Use-case semantics

### Decision
Proceed because outbox and subscriber readiness cannot be implemented correctly with the current minimal event shape.
