# Phase 2 Architecture Review - Google Ads Integration Layer

## Executive Summary

Production Ready? **NO**

## Findings

### High: Duplicate in-flight sync requests are not prevented
- **Root cause:** The sync path reuses an existing sync run by idempotency key, but it only short-circuits when the run is already `completed`. If the row is `pending` or `running`, the same request path continues into `markSyncRunRunning()` and `collectBundle()` again.
- **Attack scenario:** Two concurrent sync requests for the same connection and idempotency key can both proceed, causing duplicate Google Ads API calls and competing writes to the same normalized tables.
- **Production impact:** Duplicate sync execution, last-writer-wins behavior, wasted quota, and nondeterministic record state during retries or scheduler fan-out.
- **Exact file:** [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts#L121-L140)
- **Exact supporting file:** [identity-platform/migrations/004_google_ads_integration_layer.sql](identity-platform/migrations/004_google_ads_integration_layer.sql#L25)
- **Minimal fix:** Add an atomic single-flight transition for `pending -> running` or reject/return existing `pending` and `running` sync runs before any provider fetch begins.

### High: Incremental resume and checkpoint recovery are write-only, not read-driven
- **Root cause:** The repository writes `google_ads_sync_cursors`, but the sync engine never reads cursor state to resume from a saved checkpoint or to narrow future fetches.
- **Attack scenario:** A sync fails halfway through a large customer dataset. A retry starts from the full request window again instead of resuming from the last persisted cursor, re-reading already processed provider data.
- **Production impact:** Partial-failure recovery is inefficient and can repeatedly reprocess the same large windows. At scale, this increases quota usage, runtime, and failure probability.
- **Exact file:** [src/identity-platform/google-ads/repository.ts](src/identity-platform/google-ads/repository.ts#L219-L223)
- **Exact supporting file:** [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts#L121-L140)
- **Minimal fix:** Add cursor reads to the sync orchestration path and use them to resume from the last completed checkpoint for each entity/customer/date window.

### Medium: Provider-pluggable architecture is not actually exposed at the API boundary
- **Root cause:** The identity REST server instantiates `GoogleAdsController` and `GoogleAdsSyncService` directly and mounts Google Ads-specific routes directly in the server switch.
- **Attack scenario:** Adding Meta, TikTok, Snapchat, LinkedIn, or Pinterest requires another set of provider-specific imports, wiring, and REST branches in the same server file rather than registering a provider through a generic integration abstraction.
- **Production impact:** The current design scales by cloning provider-specific pathing into the identity server, which increases coupling and makes provider onboarding require server edits instead of plugging into a provider-agnostic integration boundary.
- **Exact file:** [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L9-L10)
- **Exact supporting file:** [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L97-L99)
- **Exact supporting file:** [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L250-L259)
- **Minimal fix:** Route integration requests through a provider-agnostic integration boundary and register provider implementations through a connector registry or equivalent abstraction instead of hardcoding provider-specific controller wiring in the identity server.

## Security Coverage Verified
- Internal normalized models exist for customer accounts, campaigns, ad groups, ads, keywords, search terms, geo metrics, device metrics, and conversion actions in [src/identity-platform/google-ads/models.ts](src/identity-platform/google-ads/models.ts#L1-L154).
- Provider-specific Google data is kept inside the integration layer and persisted as normalized records rather than exposed to the rest of the application.
- Sync run idempotency and normalized record uniqueness are enforced at the database level with unique indexes in [identity-platform/migrations/004_google_ads_integration_layer.sql](identity-platform/migrations/004_google_ads_integration_layer.sql#L25) and [identity-platform/migrations/004_google_ads_integration_layer.sql](identity-platform/migrations/004_google_ads_integration_layer.sql#L61).
- Pagination is implemented in the client layer through page token looping in [src/identity-platform/google-ads/client.ts](src/identity-platform/google-ads/client.ts#L17-L58).
- Retry is limited to retryable/transient provider failures in [src/identity-platform/google-ads/client.ts](src/identity-platform/google-ads/client.ts#L60-L110).

## Test Coverage Verified
- Google Ads client tests cover pagination, retry, quota exceeded, and invalid customer failure handling in [src/identity-platform/tests/google-ads.client.test.ts](src/identity-platform/tests/google-ads.client.test.ts).
- Repository tests cover sync-run idempotency and normalized record persistence in [src/identity-platform/tests/google-ads.repository.test.ts](src/identity-platform/tests/google-ads.repository.test.ts).
- Auth-provider tests cover encrypted token retrieval and missing refresh-token failure in [src/identity-platform/tests/google-ads.auth-provider.test.ts](src/identity-platform/tests/google-ads.auth-provider.test.ts).
- Sync-service tests cover idempotent sync execution, permission failures, quota failures, empty responses, and invalid connection handling in [src/identity-platform/tests/google-ads.sync.test.ts](src/identity-platform/tests/google-ads.sync.test.ts).

## Production Scale Review
- **100 projects:** technically workable with the current single-table normalized persistence model and indexes.
- **1,000 projects:** still workable if sync concurrency remains bounded, but the architecture remains provider-specific at the server boundary.
- **10,000 projects:** the missing cursor-driven resume path and single-flight sync protection become operational risks because retries and partial failures can repeat full-window fetches.
- **Millions of metrics:** the current design has normalized persistence and composite indexes, but the sync path lacks checkpoint-driven incremental recovery, so large-scale backfills and repeated retries are not robust enough for a long-term foundation.

## Final Verdict
**NO**

The backend is not approved as the long-term foundation for MADAR Phase 2 because duplicate in-flight syncs are not prevented, cursor/checkpoint state is not consumed for resume, and the REST boundary is still hardcoded to Google Ads instead of being provider-pluggable for the multi-provider roadmap.