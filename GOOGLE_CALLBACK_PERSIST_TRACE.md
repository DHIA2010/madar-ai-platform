# GOOGLE_CALLBACK_PERSIST_TRACE

Scope
Investigated only GET /v1/integrations/google/oauth/callback execution path (router -> controller -> service -> token exchange -> repository -> database writes).

Observed callback run (instrumented)
Request:
GET /v1/integrations/google/oauth/callback?state=go_147956ff029e8cec0bce5bbf21bbf613_bc2e479608574dcb91ecb0db1b321dec&code=debug-invalid-code-001

Observed HTTP response:
302 Location: http://localhost:3000/integrations/new?google_oauth=error&reason=token_exchange_failed

Execution trace
1) Router
- Route matched at src/identity-platform/interfaces/rest/server.ts:186-194.
- Delegates to googleOAuthController.callback(request, url.searchParams).

2) Controller
- Callback wraps service call in try/catch at src/identity-platform/google-oauth/controller.ts:56-77.
- Exception is converted to redirect reason via toSafeCallbackReason and returned as 302.
- This catch swallows the internal exception from surfacing as server error.

3) Service
- completeAuthorization starts at src/identity-platform/google-oauth/service.ts:328.
- State is validated (exists, pending, not expired) at lines 336-348.
- Token exchange called at lines 350-353.

4) Google token exchange
- exchangeAuthorizationCode at src/identity-platform/google-oauth/service.ts:190-216.
- POST to https://oauth2.googleapis.com/token.
- If response is not OK, throws GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED at line 207.
- Runtime log showed this exact throw.

5) Repository / DB write path
- Connection persistence method is GoogleOAuthRepository.upsertConnection at src/identity-platform/google-oauth/repository.ts:174.
- SQL is INSERT ... ON CONFLICT (id) DO UPDATE ... RETURNING status (lines 178-206).
- In this callback run, this method was NOT reached because token exchange failed first.

6) Transaction behavior
- Transaction block starts only after token exchange and refresh token validation at src/identity-platform/google-oauth/service.ts:391.
- Callback failed before entering transaction block; therefore no callback transaction commit/rollback occurred.

Requested determinations
1. Does Google return an access token?
- In this runtime callback attempt: No (token exchange failed before body parsing).

2. Does Google return a refresh token?
- In this runtime callback attempt: No (token exchange failed before body parsing).

3. Are both tokens successfully decrypted/parsed?
- Parsed: No (exchange failed before JSON body handling).
- Decrypted: Not applicable in callback path (callback encrypts tokens for storage; decryption occurs later in auth-provider when reading stored tokens).

4. Where should they be stored?
- Table: google_oauth_connections.
- Columns: encrypted_access_token, encrypted_refresh_token, token_expires_at, status='connected', plus provider account fields.

5. Which repository method performs the update?
- GoogleOAuthRepository.upsertConnection.

6. Is that repository method executed?
- For this callback run: No.
- Last observed execution was during OAuth start path setting status='pending'.

7. Does the SQL UPDATE affect zero rows?
- Callback persistence SQL not executed in this run, so affected rows for callback save = 0.

8. Does the transaction rollback?
- No callback transaction was entered, so no callback rollback was triggered.

9. Is an exception swallowed?
- Yes. Controller catch swallows service exception and returns 302 error redirect.

10. Why does status remain pending?
- Because callback fails at token exchange (GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED) before entering transaction and before upsertConnection(status='connected').

Actual runtime values after callback
accessToken received:
- false (not received; exchange failed)

refreshToken received:
- false (not received; exchange failed)

connection status before save:
- not reached in callback (before-save step not executed)

connection status after save:
- no callback save executed; DB remains pending

rows updated:
- 0 (callback persistence path)

repository method:
- GoogleOAuthRepository.upsertConnection (expected persistence method, not executed in callback)

SQL executed:
- Executed in callback path before failure:
  - SELECT * FROM google_oauth_states WHERE state = $1 LIMIT 1
  - External POST https://oauth2.googleapis.com/token
- Not executed in callback path due failure:
  - INSERT INTO google_oauth_connections (...) ON CONFLICT (id) DO UPDATE ... RETURNING status

Post-callback DB state (actual)
- google_oauth_connections.id=2aa80279-419e-4b3d-8c32-2d9dea234e51
  - status: pending
  - encrypted_access_token: NULL
  - encrypted_refresh_token: NULL
  - token_expires_at: NULL
- google_oauth_states.state=go_147956ff029e8cec0bce5bbf21bbf613_bc2e479608574dcb91ecb0db1b321dec
  - status: pending
  - consumed_at: NULL

Primary failure location
- File: src/identity-platform/google-oauth/service.ts
- Line: 207
- Throw: GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED
