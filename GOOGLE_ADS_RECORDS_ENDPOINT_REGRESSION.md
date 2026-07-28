# Google Ads Records Endpoint Regression

## Root Cause

`GET /v1/integrations/google-ads/records` was returning `500 INTERNAL_ERROR` for deleted connections because the Google Ads service threw a typed `GoogleAdsIntegrationError`, but the REST middleware only knew how to map `IdentityError`.

First thrown exception for the deleted-connection case:

- `GoogleAdsIntegrationError`
- Message: `Google Ads connection not found.`
- File: [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts)

The exception was previously flattened by the REST layer into `500 INTERNAL_ERROR` in:

- [src/identity-platform/interfaces/middleware/index.ts](src/identity-platform/interfaces/middleware/index.ts)
- [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts)

## Trace

1. Server route: [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts)
2. Provider dispatch: `container.infrastructure.integrations.find("google-ads")`
3. Controller: [src/identity-platform/integrations/google-ads/provider.ts](src/identity-platform/integrations/google-ads/provider.ts)
4. Service: [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts)
5. Repository: [src/identity-platform/google-ads/repository.ts](src/identity-platform/google-ads/repository.ts)
6. Google Ads client: not used for this endpoint; this route reads normalized records from the local repository

## Why Deleted Connections Still Triggered Records Loading

I did not find a direct frontend call site for this exact URL in the workspace.

What was happening instead:

- The UI was still operating on stale connection state until the delete flow completed.
- The backend integration provider for Google Ads could still be asked for records during that transition.
- Once the connection row was gone, the service threw `GOOGLE_ADS_CONNECTION_NOT_FOUND`, but the REST layer previously converted that into `500 INTERNAL_ERROR`.

So the issue was not the frontend intentionally calling an invalid endpoint; it was the backend surfacing a typed domain error as a generic internal failure.

## Backend Fix

Implemented two changes:

- Preserved typed Google Ads errors in REST error mapping so they return their intended HTTP status instead of `500`.
- Hardened `listRecords` so it explicitly checks:
  - connection existence
  - connected state
  - accessible customer id

Relevant files changed:

- [src/identity-platform/interfaces/middleware/index.ts](src/identity-platform/interfaces/middleware/index.ts)
- [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts)

## Frontend Fix

No frontend source change was required for this endpoint.

I searched the workspace and did not find a direct frontend caller for `GET /v1/integrations/google-ads/records`.

## Verification

### HTTP

I deleted a live connection and then called:

- `GET /v1/integrations/google-ads/records?connectionId=<deleted_connection>&customerId=google-ads-1`

Result:

- `404 Not Found`
- Body code: `GOOGLE_ADS_CONNECTION_NOT_FOUND`

### Service-level regression tests

- [src/identity-platform/tests/google-ads.sync.test.ts](src/identity-platform/tests/google-ads.sync.test.ts)
- [src/identity-platform/tests/google-oauth.http.test.ts](src/identity-platform/tests/google-oauth.http.test.ts)

Passed checks:

- deleted connection -> typed `GOOGLE_ADS_CONNECTION_NOT_FOUND`
- invalid customer -> typed `GOOGLE_ADS_INVALID_CUSTOMER`
- valid deleted-connection HTTP case -> `404` instead of `500`

### Command validation

Focused test files passed:

- `npm run test -- src/identity-platform/tests/google-ads.sync.test.ts`
- `npm run test -- src/identity-platform/tests/google-oauth.http.test.ts`
