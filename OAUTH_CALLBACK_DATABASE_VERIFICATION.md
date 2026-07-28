# OAUTH_CALLBACK_DATABASE_VERIFICATION

## 1) Backend OAuth callback trace only

Callback route entry:
- GET /v1/integrations/google/oauth/callback handled at [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L191)
- Dispatch to controller callback at [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L196)

Controller callback flow:
- Read query error, code, state at [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L33)
- If provider returned error: 302 with error redirect at [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L38)
- If code/state missing: 302 with error redirect at [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L47)
- Success path calls completeAuthorization at [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L57)
- Success response returns 302 with buildSuccessRedirect at [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L61)
- Failure path returns 302 with buildErrorRedirect(reason) at [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L69)

Token exchange in service:
- Callback completion starts at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L385)
- Load pending OAuth state at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L388)
- Validate status and expiry at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L393) and [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L397)
- Exchange authorization code at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L402)

Database transaction and persistence:
- Transaction starts at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L430)
- Consume state once inside transaction at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L431)
- Persist connection via upsert inside transaction at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L436)
- Persist accessible customer accounts inside transaction at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L457)
- Persist lifecycle completed event inside transaction at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L469)

Repository SQL used by transaction:
- consumeStateOnce UPDATE google_oauth_states at [src/identity-platform/google-oauth/repository.ts](src/identity-platform/google-oauth/repository.ts#L186)
- upsertConnection INSERT ... ON CONFLICT DO UPDATE google_oauth_connections at [src/identity-platform/google-oauth/repository.ts](src/identity-platform/google-oauth/repository.ts#L203)

Redirect construction:
- Success redirect URL builder at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L501)
- Error redirect URL builder at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L515)

## 2) Most recent OAuth callback verification (database-backed)

Most recent OAuth state row in database:
- OAuth state: go_f963497c609f45a389cd4cb0e65bc674_8118baf838454d628b16a6849c6c0edd
- Connection ID: f27dc794-03d5-4925-aa38-52a0cb1f79bb
- Workspace ID: edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9
- State status: pending
- State consumed_at: null
- State expires_at: 2026-07-01T17:51:37.868Z

Linked connection row for that connection ID:
- status: pending
- provider_account_id: null
- provider_account_name: null
- provider_account_email: null
- last_connected_at: null
- created_at: 2026-07-01T17:41:37.868Z
- updated_at: 2026-07-01T17:41:37.868Z

Linked customer account selection:
- selected customer row: none
- Final customerId: null

Transaction committed (YES/NO): NO
Reason:
- No consumed oauth state row exists.
- No oauth completed lifecycle event exists.
- Connection row remains in pending pre-completion shape (null provider account fields, null last_connected_at).

Connection inserted or updated by callback (YES/NO): NO
Reason:
- Callback completion transaction would consume state and upsert connection to connected.
- Observed row is unchanged pending row created at start authorization.

Final connection status:
- pending

Final providerAccountId:
- null

Final customerId:
- null

Redirect URL:
- No successful callback redirect URL is derivable from database for this latest state because completion did not commit.
- Success redirect URL is only produced by buildSuccessRedirect after successful completeAuthorization at [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L61), which is not evidenced in DB for this state.

## 3) Database query: google_oauth_connections rows created in last 10 minutes

Executed filter:
- created_at >= now() - interval 10 minutes

Rows:
- none

Returned columns requested:
- id
- workspace_id
- status
- provider_account_id
- created_at
- updated_at

Result set:
- empty

## 4) Why Connections page does not show the new connection (backend-only)

Backend completion did not finalize this OAuth authorization.

Observed backend facts for the latest state:
- google_oauth_states record is still pending and unconsumed.
- google_oauth_connections row is still pending with null provider_account_id.
- No selected Google Ads customer account exists for the connection.
- No google.oauth.authorization.completed event exists.

Therefore, backend did not persist a completed connected OAuth result for this latest authorization attempt.