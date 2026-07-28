# GOOGLE_OAUTH_RUNTIME_FIX

Date: 2026-06-28

## Runtime Environment Source

Active backend runtime source is now loaded at process startup in:
- [src/identity-platform/server.ts](src/identity-platform/server.ts#L1)
- [src/identity-platform/server.ts](src/identity-platform/server.ts#L8)
- [src/identity-platform/server.ts](src/identity-platform/server.ts#L21)

Startup loader behavior:
- Loads .env.local first if present.
- Loads .env second if present.
- Existing process environment variables are not overridden by file loader.

## Environment File Used

Observed files:
- .env.local exists and is loaded by backend startup.
- .env does not exist in this workspace.
- docker-compose backend service also references .env.local via env_file.

## Startup Command Used

Runtime validation command used:
- IDENTITY_PLATFORM_POSTGRES_URL=postgresql://madar:madar_password@localhost:5432/madar IDENTITY_PLATFORM_REDIS_URL=redis://localhost:6379 npm run identity:dev

NPM script:
- [package.json](package.json#L24)

## Variables Loaded (Runtime Loader Audit)

Using the same loader sequence as backend startup:

- IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID: Missing (defined as empty in .env.local)
- IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET: Missing (defined as empty in .env.local)
- IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI: Present
- IDENTITY_PLATFORM_GOOGLE_OAUTH_SUCCESS_REDIRECT_URI: Present
- IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY: Present
- IDENTITY_PLATFORM_TOKEN_HASH_SECRET: Present

Source of values:
- [ .env.local ](.env.local#L31)
- [ .env.local ](.env.local#L32)
- [ .env.local ](.env.local#L33)
- [ .env.local ](.env.local#L34)
- [ .env.local ](.env.local#L35)
- [ .env.local ](.env.local#L25)

## Variables Previously Missing

Before runtime loader fix:
- Backend process launched directly without loading .env.local.
- OAuth variables and token key fallback were absent from active process environment.

After runtime loader fix:
- Backend now reads .env.local at startup.
- Client ID and Client Secret remain missing because their values are empty in .env.local.

## Additional ensureConfigured Requirement Check

ensureConfigured depends on token encryption key normalization.
Current configured value in .env.local:
- IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY=dev_google_oauth_token_encryption_key_32_chars

Format validation against accepted key formats:
- Not 64-char hex
- Not base64 decoding to 32 bytes
- Not 32-char UTF-8 string

This value is present but invalid format for normalizeEncryptionKey.

Relevant code:
- [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L68)
- [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L175)

## Redirect URI and Google Cloud Console

Configured redirect URI in runtime config:
- http://localhost:4000/v1/integrations/google/oauth/callback

Source:
- [ .env.local ](.env.local#L33)
- fallback/default location in code: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L55)

Google Cloud Console match:
- Not directly verifiable from local runtime/tools (requires access to OAuth client settings in Google Cloud Console).
- No local evidence of mismatch was available.

## Verification Results

1. POST /v1/integrations/google/oauth/start
- Result: HTTP 500 INTERNAL_ERROR
- Evidence: runtime request returned 500 in controlled run.

2. Google OAuth URL generation
- Not generated due configuration exception before URL construction.

3. Browser redirect to Google
- Not reached.

4. No GOOGLE_OAUTH_CONFIGURATION_ERROR thrown
- Failed: error still thrown.
- Runtime stack shows GOOGLE_OAUTH_CONFIGURATION_ERROR at:
  - [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L177)

5. End-to-end path (Connections Center -> Connect Google Ads -> OAuth callback -> Connection Created)
- Not operational in current runtime due configuration blockers above.

## Summary

Runtime configuration loading has been fixed at backend startup.
OAuth is still not operational because required OAuth credentials are empty and current token encryption key format is invalid for ensureConfigured.
