# INFRASTRUCTURE_GUIDE

## Current Adapters
- In-memory repositories: `src/identity-platform/infrastructure/storage/in-memory.ts`
- JWT and password hashing: `src/identity-platform/infrastructure/jwt/token-service.ts`
- Rate limiter: `src/identity-platform/infrastructure/redis/in-memory-rate-limiter.ts`
- Email gateway: `src/identity-platform/infrastructure/email/in-memory-email-gateway.ts`
- Logger: `src/identity-platform/infrastructure/logger/console-logger.ts`
- Event publisher: `src/identity-platform/infrastructure/queue/in-memory-event-publisher.ts`

## Important Architectural Point
These are adapters, not architectural shortcuts. The code now depends on ports, so durable implementations can replace them without changing REST or domain logic.

## Planned Production Replacements
- `postgres/`: repository implementations for users, sessions, memberships, organizations, workspaces, invitations, and audits.
- `redis/`: distributed rate limiting and session/cache support.
- `email/`: real provider integration.
- `logger/`: structured log sink.
- `queue/`: event transport.

## Current Limitation
The architecture is production-shaped, but the default adapters are still in-memory. This is acceptable for Sprint 3.1 architecture work and tests, but not for real production traffic.
