# GOOGLE_CONNECTION_STATUS_TRACE

Connection record:
Object used by sync-service: connection = GoogleOAuthRepository.findConnectionById(input.connectionId) -> GoogleOAuthConnectionView.
Source path: src/identity-platform/google-ads/sync-service.ts:173 and src/identity-platform/google-oauth/repository.ts:224-231.
Runtime row (google_oauth_connections.id = 2aa80279-419e-4b3d-8c32-2d9dea234e51):
- id: 2aa80279-419e-4b3d-8c32-2d9dea234e51
- status: pending
- organization_id: f0297ad6-697b-4f14-86d0-c44c89fdfa6f
- project_id: af3f7a4b-cf08-46ab-bfec-1f1002fc91ca
- data_source_id: null
- provider_account_id: null
- provider_account_name: null
- provider_account_email: null
- token_expires_at: null
- encrypted_access_token: null (length 0)
- encrypted_refresh_token: null (length 0)
- connection_reference: Salla Connection

Authentication status:
There is no authenticationStatus field in the object used by sync-service or in google_oauth_connections. Effective authentication readiness is represented by connection.status.
Value at runtime: status = pending.

Connection status:
Determined from google_oauth_connections.status mapped into connection.status in mapConnection.
Query used: SELECT * FROM google_oauth_connections WHERE id = $1 AND deleted_at IS NULL LIMIT 1.
Runtime value: pending.

Connected account:
No connected account fields are populated in this connection row.
Runtime values:
- provider_account_id: null
- provider_account_name: null
- provider_account_email: null

Stored Google customer ID:
No Google customer ID is stored in google_oauth_connections for this check.
The sync request customerId is provided by request payload and passed through unchanged.
Observed request value: google-ads-1.
Usage path: sync-service forwards input.customerId; client uses it directly in Google API URL /customers/{customerId}/googleAds:search.

Access token:
encrypted_access_token is null.

Refresh token:
encrypted_refresh_token is null.

Reason service rejected connection:
sync-service rejects before token logic because connection.status !== "connected".
At runtime, connection.status was pending, so line 184 throws GOOGLE_ADS_CONNECTION_NOT_READY with message "Google Ads connection is not connected.".

File:
src/identity-platform/google-ads/sync-service.ts

Line:
184

Additional explicit checks requested:
- Is authenticationStatus null? Not a field in this execution path; effectively absent.
- Is accessToken missing? Yes (encrypted_access_token is null).
- Is refreshToken missing? Yes (encrypted_refresh_token is null).
- Is tokenExpired true? Not computed here because token_expires_at is null and sync-service fails earlier on status.
- Is account status draft? No evidence in this path; the related data_sources row for this project is status=enabled (not used by sync-service).
- Is connection status draft? No. google_oauth_connections.status is pending, not draft.
- Is connectedAccount missing? Yes (provider_account_id/name/email are null).
- Is customerId invalid? Not validated at this stage beyond non-empty/max length schema; value google-ads-1 passes schema.
- Is oauthState incomplete? Yes. Latest google_oauth_states rows for this connection are status=pending with consumed_at=null.

CustomerId alias verification:
customerId="google-ads-1" is not treated as a local alias by backend. It is passed directly as the Google API customer path segment. If this is a local alias, it is being used as the actual Google Customer ID value.
