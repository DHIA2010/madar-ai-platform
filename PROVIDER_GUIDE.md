# PROVIDER_GUIDE

## Provider Abstractions
- Clock
- UUID Generator
- Password Hasher
- Token Service
- Email Gateway
- Storage Provider
- Cache Provider
- Feature Flag Provider
- Configuration Provider
- Metrics Provider
- Event Publisher

## Why This Matters
Application and domain code now depend on explicit ports instead of concrete infrastructure classes.

## Implementations Included In Sprint 3.2
- Scrypt password hasher
- HMAC JWT/token service
- SMTP email gateway
- Local storage provider
- Redis cache provider
- Environment feature flag provider
- Environment configuration provider
- In-memory metrics provider
- PostgreSQL outbox event publisher
