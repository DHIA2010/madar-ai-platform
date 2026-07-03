# RUN_SYNC_ROOT_CAUSE

Endpoint
POST /v1/integrations/google-ads/sync

Incoming payload
{
  "connectionId": "2aa80279-419e-4b3d-8c32-2d9dea234e51",
  "customerId": "google-ads-1",
  "startDate": "2026-06-22",
  "endDate": "2026-06-29",
  "idempotencyKey": "sync-debug-001",
  "mode": "incremental"
}

First thrown exception
GoogleAdsIntegrationError

Exception message
Google Ads connection is not connected.

Stack trace
Error: Google Ads connection is not connected.
    at GoogleAdsSyncService.sync (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/google-ads/sync-service.ts:184:13)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async Server.<anonymous> (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/interfaces/rest/server.ts:247:28)

Root cause
The sync request fails before any Google Ads API call because the selected OAuth connection is not in "connected" status. In GoogleAdsSyncService.sync, the service loads the connection and immediately enforces a readiness gate:
- if connection.status !== "connected" -> throw GOOGLE_ADS_CONNECTION_NOT_READY (409).

The reproduced connection id (2aa80279-419e-4b3d-8c32-2d9dea234e51) is currently pending, so the request throws at the readiness guard and is then returned as INTERNAL_ERROR by generic middleware error mapping.

File
src/identity-platform/google-ads/sync-service.ts

Line
184

customerId pass-through/translation verification
Verified pass-through (no translation):
- Request schema accepts customerId as plain string (src/identity-platform/schemas.ts:110).
- Route forwards parsed payload directly to provider.sync (src/identity-platform/interfaces/rest/server.ts:246-247).
- Controller forwards input unchanged to service (src/identity-platform/google-ads/controller.ts:9-10).
- Service uses input.customerId directly for persistence and all stage service calls (src/identity-platform/google-ads/sync-service.ts:218,259,267,294-306).
- GoogleAdsClient builds API URL directly from input.customerId: /customers/{customerId}/googleAds:search (src/identity-platform/google-ads/client.ts:65).

Observed runtime payload in backend logs confirms customerId stayed exactly "google-ads-1" throughout request handling.

Cause component classification
Google Ads integration backend domain/service layer precondition failure (connection lifecycle state gate), surfaced as infrastructure INTERNAL_ERROR due to non-IdentityError wrapping.
