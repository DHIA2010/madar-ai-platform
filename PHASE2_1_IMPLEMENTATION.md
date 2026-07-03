# Phase 2.1 Implementation - Architecture Hardening

## Scope
This implementation resolves only the three architecture blockers identified by the production review:
1. Duplicate in-flight sync prevention
2. Cursor/checkpoint resume consumption
3. Provider plugability at the API boundary

No OAuth logic was modified.
No frontend work was performed.
No analytics implementation was added.

## Blocker 1 - Duplicate In-Flight Sync

### Implemented
- Added a database-backed sync lease table:
  - `google_ads_sync_locks`
  - migration: [identity-platform/migrations/004_google_ads_integration_layer.sql](identity-platform/migrations/004_google_ads_integration_layer.sql#L67)
- Added repository lock APIs:
  - `acquireSyncLock`
  - `extendSyncLock`
  - `releaseSyncLock`
  - code: [src/identity-platform/google-ads/repository.ts](src/identity-platform/google-ads/repository.ts#L132)
- Added active lock rejection with explicit error:
  - `GOOGLE_ADS_SYNC_IN_PROGRESS`
  - code: [src/identity-platform/google-ads/errors.ts](src/identity-platform/google-ads/errors.ts#L1)
  - code: [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts#L169)
- Lock lifecycle is crash-safe/distributed:
  - lease persisted in DB with expiry (`locked_until`)
  - lock is released in `finally`
  - stale lock can be reclaimed after lease expiry

### Behavior
- At most one active sync lease per `(provider_key, connection_id, project_id)`.
- A second concurrent sync attempt returns `409` via `GOOGLE_ADS_SYNC_IN_PROGRESS`.

## Blocker 2 - Cursor / Checkpoint Resume

### Implemented
- Added checkpoint table:
  - `google_ads_sync_checkpoints`
  - migration: [identity-platform/migrations/004_google_ads_integration_layer.sql](identity-platform/migrations/004_google_ads_integration_layer.sql#L88)
- Added checkpoint repository APIs:
  - `loadSyncCheckpoint`
  - `saveSyncCheckpoint`
  - code: [src/identity-platform/google-ads/repository.ts](src/identity-platform/google-ads/repository.ts#L246)
- Sync orchestration now consumes checkpoints before execution:
  - determines resume stage
  - computes incremental effective start from stored `last_record_date`
  - code: [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts#L214)
- Stage-by-stage persistence with checkpoint updates:
  - each stage persists and records progress (`stage`, `counts`, `last_record_date`)
  - checkpoint status transitions `in_progress` -> `completed`
  - code: [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts#L265)
- Sync request now supports explicit mode with incremental default:
  - `mode: "full" | "incremental"`, default `incremental`
  - schema: [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L108)
  - type: [src/identity-platform/google-ads/types.ts](src/identity-platform/google-ads/types.ts#L3)

### Behavior
- Sync does not always start from scratch.
- Failed mid-run sync resumes from persisted stage/checkpoint.
- Incremental mode advances from prior checkpoint date unless full sync is explicitly requested.

## Blocker 3 - Provider Plugability

### Implemented
- Added provider registry abstraction:
  - `IntegrationProviderRegistry`
  - code: [src/identity-platform/integrations/provider-registry.ts](src/identity-platform/integrations/provider-registry.ts#L1)
- Added Google Ads provider adapter registered in container:
  - `GoogleAdsIntegrationProvider`
  - code: [src/identity-platform/integrations/google-ads/provider.ts](src/identity-platform/integrations/google-ads/provider.ts#L1)
  - registration: [src/identity-platform/dependency-injection/container.ts](src/identity-platform/dependency-injection/container.ts#L103)
- Replaced provider-specific sync/records routing with generic route:
  - `POST /v1/integrations/{provider}/sync`
  - `GET /v1/integrations/{provider}/records`
  - code: [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L171)
- Added provider-not-found handling at runtime:
  - code: [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L177)
- OpenAPI updated to provider-agnostic integration endpoints:
  - [src/identity-platform/interfaces/openapi/identity-openapi-spec.ts](src/identity-platform/interfaces/openapi/identity-openapi-spec.ts#L74)

### Behavior
- New providers can register via container/registry without editing route switch logic for sync/records.
- The server integration boundary no longer references Google Ads services directly for those operations.

## Provider/Model Isolation Check
- Normalized persistence remains internal-model based in `google_ads_domain_records`.
- Provider-specific payloads are not exposed through analytics abstractions in this change.
- API route now resolves integration provider by registry key and does not hardcode Google sync service in server route logic.

## Files Changed
- [identity-platform/migrations/004_google_ads_integration_layer.sql](identity-platform/migrations/004_google_ads_integration_layer.sql)
- [src/identity-platform/google-ads/errors.ts](src/identity-platform/google-ads/errors.ts)
- [src/identity-platform/google-ads/repository.ts](src/identity-platform/google-ads/repository.ts)
- [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts)
- [src/identity-platform/google-ads/types.ts](src/identity-platform/google-ads/types.ts)
- [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts)
- [src/identity-platform/dependency-injection/container.ts](src/identity-platform/dependency-injection/container.ts)
- [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts)
- [src/identity-platform/interfaces/openapi/identity-openapi-spec.ts](src/identity-platform/interfaces/openapi/identity-openapi-spec.ts)
- [src/identity-platform/integrations/provider-registry.ts](src/identity-platform/integrations/provider-registry.ts)
- [src/identity-platform/integrations/google-ads/provider.ts](src/identity-platform/integrations/google-ads/provider.ts)
- [src/identity-platform/tests/google-ads.sync.test.ts](src/identity-platform/tests/google-ads.sync.test.ts)
- [src/identity-platform/tests/google-ads.repository.test.ts](src/identity-platform/tests/google-ads.repository.test.ts)
- [src/identity-platform/tests/provider-registry.test.ts](src/identity-platform/tests/provider-registry.test.ts)
