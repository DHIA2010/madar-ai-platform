# OAUTH_CALLBACK_TRANSACTION_ROOT_CAUSE

Scope: backend OAuth callback transaction only.

## Callback Step Trace (latest observed callback state)

Observed latest state row:
- state: `go_f963497c609f45a389cd4cb0e65bc674_8118baf838454d628b16a6849c6c0edd`
- status: `pending`
- expires_at: `2026-07-01T17:51:37.868Z`
- connection_id: `f27dc794-03d5-4925-aa38-52a0cb1f79bb`

Execution path source:
- callback route: [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L191)
- controller callback: [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L33)
- completion service: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L391)

### A-J status

| Step | entered | completed |
|---|---|---|
| A. Validate OAuth state | YES | NO |
| B. Exchange authorization code for tokens | NO | NO |
| C. Parse token response | NO | NO |
| D. Fetch Google user profile | NO | NO |
| E. Begin database transaction | NO | NO |
| F. Update google_oauth_connections | NO | NO |
| G. Persist tokens | NO | NO |
| H. Commit transaction | NO | NO |
| I. Build success redirect | NO | NO |
| J. Redirect response (success) | NO | NO |

Why A does not complete:
- state expiry check fails in callback completion:
- [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L403)
- [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L405)

## First Step That Does Not Complete

- Step A: Validate OAuth state.

## Exception (first thrown)

- exception type: `Error`
- message: `GOOGLE_OAUTH_STATE_EXPIRED`
- stack:
```text
Error: GOOGLE_OAUTH_STATE_EXPIRED
    at GoogleOAuthService.completeAuthorization (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/google-oauth/service.ts:399:13)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async file:///Users/dheyahagar/Documents/madar-platform/pulse-ui-next/[eval1]:39:3
```
- file: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L405)
- line: 405 (throw site), with stack resolving to method frame line 399 in runtime transpiled mapping.

## Root Cause

OAuth state TTL was too short for real callback latency, so callback hit after state expiry and aborted before transaction start.

Pre-fix TTL behavior:
- state expiry was generated from a fixed 10-minute window in startAuthorization.

Resulting effect:
- no transaction begin, no connection update, no token persistence, no commit.
- connection remains pending with null `provider_account_id` and no selected customer account.

## Fix Applied (callback flow only)

File changed:
- [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts)

Changes:
1. Added configurable OAuth state TTL to service config:
- `stateTtlMinutes` in config interface at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L18)
- default from env `IDENTITY_PLATFORM_GOOGLE_OAUTH_STATE_TTL_MINUTES`, default value `30` at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L67)

2. Added config validation for TTL:
- positive finite check at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L202)

3. Replaced fixed 10-minute expiry with configured TTL:
- state expiry computation at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L320)

## Validation

Focused test run after fix:
- command: `npm run test -- src/identity-platform/tests/google-oauth.service.test.ts`
- result: `1 passed, 7 passed`
