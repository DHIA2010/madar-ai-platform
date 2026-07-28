# STEP2_IMPLEMENTATION

## Scope Delivered
Phase 2 backend integration layer for Google Ads was implemented without frontend/dashboard/analytics changes.

Included:
- Google Ads API client with retry, rate limiting, pagination, and error mapping.
- Token access/refresh bridge using existing encrypted OAuth tokens from Step 1.
- Provider-independent normalized domain models.
- Data synchronization service with idempotency and transactional persistence.
- PostgreSQL persistence for sync runs, normalized records, and sync cursors.
- REST endpoints for sync trigger and normalized record retrieval.
- OpenAPI updates.
- Unit/integration/repository/negative tests.

## Key Modules
- `src/identity-platform/google-ads/client.ts`
  - Handles API calls, pagination, retry, and provider error mapping.
- `src/identity-platform/google-ads/auth-provider.ts`
  - Decrypts stored Step 1 OAuth tokens, refreshes access token when expired, persists refreshed token safely.
- `src/identity-platform/google-ads/services.ts`
  - Customer, Campaign, Metrics, Ad Group, Ads, Keywords, Search Terms, Geo, Device, Conversion retrieval.
- `src/identity-platform/google-ads/models.ts`
  - Internal provider-agnostic models only.
- `src/identity-platform/google-ads/repository.ts`
  - Idempotent sync-run management and normalized record/cursor persistence.
- `src/identity-platform/google-ads/sync-service.ts`
  - Orchestration, authorization checks, idempotent sync behavior, transaction boundaries.
- `src/identity-platform/google-ads/controller.ts`
  - API controller layer.

## Database
Added migration:
- `identity-platform/migrations/004_google_ads_integration_layer.sql`

Tables:
- `google_ads_sync_runs`
- `google_ads_domain_records`
- `google_ads_sync_cursors`

Characteristics:
- Unique idempotency key per connection (`uq_google_ads_sync_runs_idempotency`).
- Natural-key upsert for normalized records to avoid duplicates.
- Per-entity sync cursor persistence for incremental-readiness.

## Clean Architecture Boundary
Google provider payloads are consumed inside Google Ads integration services and normalized into internal models before persistence.
No Google-specific DTOs are exposed outside the integration layer.

## Integration Points Added
- `src/identity-platform/interfaces/rest/server.ts`
  - `POST /v1/integrations/google-ads/sync`
  - `GET /v1/integrations/google-ads/records`
- `src/identity-platform/schemas.ts`
  - request/query validation schemas for sync and records API.
- `src/identity-platform/interfaces/openapi/identity-openapi-spec.ts`
  - OpenAPI path entries for Phase 2 endpoints.
- `src/identity-platform/infrastructure/postgres/migration-runner.ts`
  - migration registration for `004_google_ads_integration_layer.sql`.
- `.env.example`
  - Added Google Ads integration environment variables.

## Security and Reliability
- No token/secret/authorization header logging in Phase 2 code paths.
- Uses Step 1 encrypted token storage and decryption.
- Retry only for transient/provider retryable failures.
- Idempotent sync execution via connection + idempotency key.
- Transactional run completion and persistence operations.
