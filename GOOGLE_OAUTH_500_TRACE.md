# GOOGLE_OAUTH_500_TRACE

Date: 2026-06-28
Mode: Read-only runtime trace

## Request Path Trace

1. Controller
- Entry route: [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L226)
- Controller call: [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L232)
- Controller method: [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L27)

2. Service
- Service entry: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L240)
- First operation in start path: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L242)

3. Repository
- Next step after config check would be project resolution: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L244)
- Repository method: [src/identity-platform/google-oauth/repository.ts](src/identity-platform/google-oauth/repository.ts#L86)
- Not reached before the first exception.

4. OAuth Client
- Google auth URL generation starts later in service at: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L284)
- Token exchange client is callback path only: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L191)
- Not reached before the first exception.

5. Configuration
- Runtime config builder uses env-backed values and defaults: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L36)
- Validation gate: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L175)

6. Database
- DB access starts at repository resolveProject query: [src/identity-platform/google-oauth/repository.ts](src/identity-platform/google-oauth/repository.ts#L87)
- Not reached before the first exception.

7. Google OAuth URL generation
- URL object creation: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L284)
- Not reached before the first exception.

## First Exception Thrown

- Exception type: Error
- Message: GOOGLE_OAUTH_CONFIGURATION_ERROR
- File: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts)
- Line: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L177)
- Stack origin:
  - [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L242)
  - [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L27)
  - [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L232)
- Why it occurs:
  - `startAuthorization` calls `ensureConfigured(this.config)` immediately.
  - `ensureConfigured` throws when required OAuth config is missing/invalid (client id, client secret, redirect/success redirect URI, scopes, or token encryption key normalization).
  - This error is not an IdentityError, so middleware maps it to HTTP 500 INTERNAL_ERROR: [src/identity-platform/interfaces/middleware/index.ts](src/identity-platform/interfaces/middleware/index.ts#L29)

## Root Cause Classification

- Missing OAuth credentials

## Runtime Evidence

- Endpoint: POST /v1/integrations/google/oauth/start
- Observed response: HTTP 500 with body `{ "code": "INTERNAL_ERROR", "category": "infrastructure", "message": "Unexpected error." }`
- Prior UUID validation failure is no longer the first failure point.
