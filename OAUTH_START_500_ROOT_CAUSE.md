# OAUTH_START_500_ROOT_CAUSE

Date: 2026-06-29
Scope: Backend runtime only (read-only)

## Reproduction (exactly one OAuth start request)

Isolated backend instance started on port `4101`:
- Command:
  - `IDENTITY_PLATFORM_PORT=4101 FRONTEND_PORT=3001 IDENTITY_PLATFORM_POSTGRES_URL='postgresql://madar:madar_password@localhost:5432/madar' IDENTITY_PLATFORM_REDIS_URL='redis://localhost:6379' npm run identity:dev`

One authenticated OAuth-start request sent:
1. `POST /v1/auth/login` (to obtain token) -> success (`token_len=447`)
2. `POST /v1/integrations/google/oauth/start` with body:
   - `{"workspaceId":"edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9","projectId":null,"connectionName":"Runtime Probe"}`

Observed response:
- `HTTP/1.1 500 Internal Server Error`
- Body: `{"code":"INTERNAL_ERROR","category":"infrastructure","message":"Unexpected error."}`

## Full backend stack trace (captured)

`Unmapped error: GOOGLE_OAUTH_CONFIGURATION_ERROR`

`Stack: Error: GOOGLE_OAUTH_CONFIGURATION_ERROR`

`    at ensureConfigured (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/google-oauth/service.ts:177:11)`

`    at GoogleOAuthService.startAuthorization (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/google-oauth/service.ts:242:5)`

`    at GoogleOAuthController.start (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/google-oauth/controller.ts:30:25)`

`    at Server.<anonymous> (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/interfaces/rest/server.ts:232:54)`

`    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`

## First exception thrown

- Exception type: `Error`
- Exception message: `GOOGLE_OAUTH_CONFIGURATION_ERROR`
- File: `/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/google-oauth/service.ts`
- Line: `177`
- Call stack: see full stack trace above

## Cause classification

From runtime evidence, failure is caused by configuration, specifically OAuth client configuration being missing/invalid at runtime.

Category decision:
- missing environment variable: YES (effective values missing in expected runtime keys)
- invalid encryption key: NO (runtime key present)
- Google OAuth client configuration: YES
- redirect URI mismatch: NOT REACHED (failure occurs at configuration gate before OAuth redirect)
- database: NO (login succeeded)
- repository: NO evidence
- HTTP client: NO evidence
- other: NO

## Exact missing/invalid variables and runtime values

Runtime env inspection (backend-style env loading from `.env.local`, `.env` when present):

Observed OAuth-related runtime values:
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID=` (empty string)
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET=` (empty string)
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/v1/integrations/google/oauth/callback`
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile,openid`
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY=dev_google_oauth_token_encryption_key_32_chars` (present)
- `IDENTITY_PLATFORM_TOKEN_HASH_SECRET` present (masked; length=42)

Additional unprefixed keys checked for presence state:
- `GOOGLE_OAUTH_CLIENT_ID: __UNDEFINED__`
- `GOOGLE_OAUTH_CLIENT_SECRET: __UNDEFINED__`
- `GOOGLE_OAUTH_REDIRECT_URI: __UNDEFINED__`
- `GOOGLE_OAUTH_SCOPES: __UNDEFINED__`

Root-cause variable set (exact):
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID` is invalid at runtime (empty)
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET` is invalid at runtime (empty)

These invalid client credentials trigger `ensureConfigured` and cause the first thrown exception `GOOGLE_OAUTH_CONFIGURATION_ERROR`.