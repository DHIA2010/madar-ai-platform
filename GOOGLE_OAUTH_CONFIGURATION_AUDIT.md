# GOOGLE_OAUTH_CONFIGURATION_AUDIT

Date: 2026-06-28
Mode: Read-only configuration audit

## Runtime Context Audited

- Active backend listener on port 4000 is a local process:
  - Command: node --import tsx src/identity-platform/server.ts
  - Working directory: /Users/dheyahagar/Documents/madar-platform/pulse-ui-next
- Running Docker containers do not include backend at audit time (frontend, postgres, redis, minio, mailpit only).

## 1) Does the application load .env successfully?

For the active backend runtime: No.

Evidence:
- Backend entrypoint [src/identity-platform/server.ts](src/identity-platform/server.ts#L1) does not load dotenv.
- Active process environment inspection shows OAuth vars absent.
- .env files exist, but they are not auto-loaded by this direct Node launch.

## 2) Required OAuth Variables Present At Runtime

OAuth start config is built in [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L36) and validated by [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L175).

| Expected variable name | Runtime value status | Source | Blocks OAuth startup |
|---|---|---|---|
| IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID | Missing | Active process environment: missing. .env.local: missing. | Yes |
| IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET | Missing | Active process environment: missing. .env.local: missing. | Yes |
| IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI | Missing | Active process environment: missing. Falls back to code default. | No (default exists) |
| IDENTITY_PLATFORM_GOOGLE_OAUTH_SUCCESS_REDIRECT_URI | Missing | Active process environment: missing. Falls back to NEXT_PUBLIC_APP_URL based default. | No (default exists) |
| IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY | Missing | Active process environment: missing. .env.local: missing. | Yes unless fallback key exists in process env |
| IDENTITY_PLATFORM_TOKEN_HASH_SECRET | Missing in active runtime | Active process environment: missing. .env.local has value, but not loaded into active process. | Yes for OAuth token key fallback in active runtime |

## 3) Variable Name Match Audit (expected vs defined)

Expected names in code:
- IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID
- IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET
- IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI
- IDENTITY_PLATFORM_GOOGLE_OAUTH_SUCCESS_REDIRECT_URI
- IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY
- Fallback: IDENTITY_PLATFORM_TOKEN_HASH_SECRET

Result:
- Names expected by code are correct and explicit in [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L52).
- Problem is not a naming mismatch in code.
- Problem is missing variables in the active runtime environment.

## 4) Is the loader reading the correct .env file?

For active backend runtime: No .env file is loaded by the process itself.

- Backend launched directly via node --import tsx src/identity-platform/server.ts.
- No dotenv loader in backend startup path.
- Docker compose is configured to load .env.local for backend service [docker-compose.yml](docker-compose.yml#L100), but backend container is not running in the current active runtime.

## 5) Overrides / Missing Values in Active Runtime

- OAuth client id/secret are missing from active process env.
- OAuth token encryption key is missing from active process env.
- Token hash secret fallback is also missing from active process env, even though .env.local contains it [/.env.local](.env.local#L25).
- Therefore ensureConfigured fails early with GOOGLE_OAUTH_CONFIGURATION_ERROR.

## 6) Redirect URI verification against Google Cloud Console

Configured runtime behavior in current process:
- Redirect URI env var is missing, so default is used:
  - http://localhost:4000/v1/integrations/google/oauth/callback

Match with Google Cloud Console:
- Not directly verifiable from local code/runtime alone (requires access to Google Cloud OAuth client settings).
- Required action for verification: confirm the exact URI above is registered in Google Cloud Console OAuth client redirect URIs.

## 7) Token Encryption Key requirement

ensureConfigured requires a valid token key path via:
- IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY
- or fallback IDENTITY_PLATFORM_TOKEN_HASH_SECRET

Active runtime result:
- Both are missing in process environment, so configuration check fails before repository/database/OAuth URL generation path.

## Conclusion

This is a runtime environment configuration loading/presence issue in the active backend process.

- OAuth client credentials are missing.
- Encryption key source is missing in active process env.
- Backend process is not loading .env.local in this launch mode.
