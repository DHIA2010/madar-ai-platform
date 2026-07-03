# GOOGLE_CALLBACK_RUNTIME_CAPTURE

Runtime capture scope
- Endpoint traced: GET /v1/integrations/google/oauth/callback
- Trace path: router -> controller -> service -> Google token exchange -> repository -> database write
- Capture source: live backend runtime logs from one completed OAuth callback plus post-callback DB query.

Observed callback run
- connectionId: 2aa80279-419e-4b3d-8c32-2d9dea234e51
- state: present, length 68
- authorization code: present, length 73

Observed runtime values
- Authorization code received: present (length 73)
- Access token received: present (length 253)
- Refresh token received: present (length 103)
- Google customer/account information returned:
  - id: 109241329109033021812
  - email: dhiamuhammed@gmail.com
  - name: ضياء حجر
- Repository update method invoked: GoogleOAuthRepository.upsertConnection
- SQL rows affected: 1
- Connection status before update: pending
- Connection status after update: connected
- encrypted_access_token persisted?: YES
- encrypted_refresh_token persisted?: YES

Repository method and SQL executed
- Repository method: GoogleOAuthRepository.upsertConnection
- SQL executed:
  - INSERT INTO google_oauth_connections (...) VALUES (...)
    ON CONFLICT (id) DO UPDATE SET ...
    RETURNING status

Database state after callback (actual)
- status: connected
- encrypted_access_token: NOT NULL (length 385)
- encrypted_refresh_token: NOT NULL (length 185)
- token_expires_at: 2026-06-29 19:57:02.744+00
- provider_account_id: 109241329109033021812
- provider_account_email: dhiamuhammed@gmail.com
- provider_account_name: ضياء حجر

Failure analysis for this run
- Persistence did not fail.
- No statement failed during this captured callback.
- Tokens were persisted successfully and remained persisted in database.

Redirect behavior
- Yes, callback intentionally redirects in both outcomes:
  - success path returns 302 with success redirect
  - error path catches exception and still returns 302 with error reason

Key file references
- Callback route handling: src/identity-platform/interfaces/rest/server.ts:186
- Controller redirect behavior (success and error catch): src/identity-platform/google-oauth/controller.ts:64 and src/identity-platform/google-oauth/controller.ts:76
- Token exchange and failure throw points: src/identity-platform/google-oauth/service.ts:194 and src/identity-platform/google-oauth/service.ts:207
- Callback persistence transaction and upsert invocation: src/identity-platform/google-oauth/service.ts:398 and src/identity-platform/google-oauth/service.ts:413
- Repository upsert SQL: src/identity-platform/google-oauth/repository.ts:173

Access token received:
present (length 253)
Refresh token received:
present (length 103)
Rows updated:
1
Status before:
pending
Status after:
connected
Access token persisted:
YES
Refresh token persisted:
YES
Redirect executed:
YES (302)
First failing statement:
NONE (no failure in this runtime capture)
File:
src/identity-platform/google-oauth/service.ts
Line:
N/A