# REDIS_GUIDE

## Purpose
Redis handles volatile and distributed backend concerns that should not live in PostgreSQL.

## Implemented Components
- `src/identity-platform/infrastructure/redis/node-redis-client.ts`
- `src/identity-platform/infrastructure/redis/redis-session-repository.ts`
- `src/identity-platform/infrastructure/redis/redis-rate-limiter.ts`
- `src/identity-platform/infrastructure/redis/redis-cache-provider.ts`

## Capabilities
- Session storage and refresh-token lookup.
- Distributed rate limiting.
- Cache abstraction with health checks.
- Reconnect strategy.
- Key prefix isolation.
- TTL-based lifecycle management.

## Design Readiness
- Distributed locks are design-ready through the `RedisLikeClient` abstraction.
- Future clustering compatibility is preserved by staying on the official Redis client surface.
