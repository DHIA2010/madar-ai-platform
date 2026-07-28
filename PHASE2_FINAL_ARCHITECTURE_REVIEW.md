# PHASE 2 Final Architecture Review

Scope: Current codebase only (no historical assumptions, no code changes)
Date: 2026-06-28

## 1) Duplicate In-Flight Sync Protection

Current status: Resolved

Evidence:
- Lock persistence model exists with uniqueness at the provider+connection+project boundary: identity-platform/migrations/004_google_ads_integration_layer.sql:67, identity-platform/migrations/004_google_ads_integration_layer.sql:79.
- Repository acquires lock transactionally, checks active lease, and rejects concurrent in-flight acquisition: src/identity-platform/google-ads/repository.ts:153, src/identity-platform/google-ads/repository.ts:157, src/identity-platform/google-ads/repository.ts:170, src/identity-platform/google-ads/repository.ts:171, src/identity-platform/google-ads/repository.ts:183.
- Service enforces single-flight behavior by returning conflict when lock acquisition fails: src/identity-platform/google-ads/sync-service.ts:195, src/identity-platform/google-ads/sync-service.ts:207.
- Lock lease is extended during staged persistence and released in finally block: src/identity-platform/google-ads/repository.ts:221, src/identity-platform/google-ads/sync-service.ts:264, src/identity-platform/google-ads/sync-service.ts:383.

Remaining risks:
- Lock lease duration is fixed (3600s in service path), so extremely long/hung work depends on successful lease extension cadence: src/identity-platform/google-ads/sync-service.ts:201, src/identity-platform/google-ads/sync-service.ts:285.

## 2) Cursor / Checkpoint Resume

Current status: Resolved

Evidence:
- Checkpoint schema and lookup index exist for persisted resume state: identity-platform/migrations/004_google_ads_integration_layer.sql:85, identity-platform/migrations/004_google_ads_integration_layer.sql:99, identity-platform/migrations/004_google_ads_integration_layer.sql:103.
- Service loads checkpoint and computes resume stage for in-progress recovery: src/identity-platform/google-ads/sync-service.ts:235, src/identity-platform/google-ads/sync-service.ts:241, src/identity-platform/google-ads/sync-service.ts:311.
- Incremental resume start date is derived from completed checkpoint last record date: src/identity-platform/google-ads/sync-service.ts:244.
- Checkpoint is persisted after each stage and finalized as completed at end of run: src/identity-platform/google-ads/sync-service.ts:264, src/identity-platform/google-ads/sync-service.ts:339.
- Repository persists and retrieves checkpoint payload/version/status: src/identity-platform/google-ads/repository.ts:256, src/identity-platform/google-ads/repository.ts:291.
- Cursor table exists and is updated per entity type during bundle upsert: identity-platform/migrations/004_google_ads_integration_layer.sql:105, identity-platform/migrations/004_google_ads_integration_layer.sql:114, src/identity-platform/google-ads/repository.ts:411.

Remaining risks:
- Current resume orchestration is checkpoint-first; sync cursor data is maintained but not used as the primary resume driver in service orchestration. This is acceptable now but should remain aligned as providers expand.

## 3) Provider Registry / Provider-Pluggable Architecture

Current status: Resolved

Evidence:
- Provider abstraction and registry are implemented (register/find/list): src/identity-platform/integrations/provider-registry.ts:21, src/identity-platform/integrations/provider-registry.ts:28, src/identity-platform/integrations/provider-registry.ts:31, src/identity-platform/integrations/provider-registry.ts:36.
- Google Ads provider is implemented as an adapter over the sync service: src/identity-platform/integrations/google-ads/provider.ts:6, src/identity-platform/integrations/google-ads/provider.ts:12, src/identity-platform/integrations/google-ads/provider.ts:16.
- DI container instantiates registry, registers provider, and exposes registry in infrastructure: src/identity-platform/dependency-injection/container.ts:117, src/identity-platform/dependency-injection/container.ts:118, src/identity-platform/dependency-injection/container.ts:162.
- REST routing dispatches by provider id via registry and invokes provider sync/records handlers: src/identity-platform/interfaces/rest/server.ts:235, src/identity-platform/interfaces/rest/server.ts:239, src/identity-platform/interfaces/rest/server.ts:245, src/identity-platform/interfaces/rest/server.ts:250.
- OpenAPI now documents provider-keyed integration endpoints: src/identity-platform/interfaces/openapi/identity-openapi-spec.ts:61, src/identity-platform/interfaces/openapi/identity-openapi-spec.ts:78.

Remaining risks:
- Route-level request validation currently uses Google Ads-named schemas in provider-generic routes (shape is currently compatible but naming/coupling remains): src/identity-platform/interfaces/rest/server.ts:246, src/identity-platform/interfaces/rest/server.ts:251, src/identity-platform/schemas.ts:108, src/identity-platform/schemas.ts:117.

## Final Verdict

Is Phase 2 architecture approved as the long-term foundation for MADAR?

YES

Phase 2 is closed and Phase 3 may begin.
