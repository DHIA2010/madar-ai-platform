# Google Ads Records Real Execution Trace

## What Was Proved

I instrumented the backend records endpoint and then triggered one authenticated browser-side GET request to:

- `GET /v1/integrations/google-ads/records?connectionId=2aa80279-419e-4b3d-8c32-2d9dea234e51&customerId=google-ads-1`

The request executed the modified backend code path.

## Emitted Logs

From the live backend terminal during the request:

```text
REQUEST HIT {
  connectionId: '2aa80279-419e-4b3d-8c32-2d9dea234e51',
  customerId: 'google-ads-1'
}
LIST_RECORDS_THROW {
  code: 'GOOGLE_ADS_CONNECTION_NOT_FOUND',
  connectionId: '2aa80279-419e-4b3d-8c32-2d9dea234e51',
  customerId: 'google-ads-1'
}
REST_ERROR_MAPPER {
  exceptionType: 'Error',
  message: 'Google Ads connection not found.',
  stack: 'Error: Google Ads connection not found.\n    at GoogleAdsSyncService.listRecords (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/google-ads/sync-service.ts:413:13)\n    at async Server.<anonymous> (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/interfaces/rest/server.ts:273:37)',
  status: 404
}
```

There was also an earlier browser attempt with an expired token that hit the auth layer first and returned `401 AUTH_TOKEN_INVALID`; that was not the trace request used for proving the records path.

## First Thrown Exception

- Exception type: `GoogleAdsIntegrationError`
- Message: `Google Ads connection not found.`
- File: [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts#L413)

## HTTP Response Produced

The single browser-side request returned:

- Status: `404 Not Found`
- Body:

```json
{
  "code": "GOOGLE_ADS_CONNECTION_NOT_FOUND",
  "category": "business",
  "message": "Google Ads connection not found."
}
```

## File And Route Chain

- Server route: [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L267)
- Provider: `GoogleAdsIntegrationProvider`
- Service: [src/identity-platform/google-ads/sync-service.ts](src/identity-platform/google-ads/sync-service.ts#L408)
- Repository: [src/identity-platform/google-ads/repository.ts](src/identity-platform/google-ads/repository.ts)

## Verification Notes

- The browser request was made from the active browser session context.
- The connection used in the request had already been deleted.
- The backend emitted the `REQUEST HIT` log before entering the service.
- The backend emitted the `LIST_RECORDS_THROW` log before throwing.
- The global REST error mapper emitted the exception details before returning the HTTP response.

## Cleanup

The temporary logging was removed after capture.
