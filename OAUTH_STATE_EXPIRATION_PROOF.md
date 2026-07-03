# OAUTH_STATE_EXPIRATION_PROOF

Scope: prove or disprove whether the latest real OAuth callback failed because the callback arrived after the configured state TTL.

## Proven runtime evidence

Latest persisted OAuth state previously observed in the real runtime:
- OAuth state: `go_f963497c609f45a389cd4cb0e65bc674_8118baf838454d628b16a6849c6c0edd`
- State created_at: `2026-07-01T17:41:37.873Z`
- State expires_at: `2026-07-01T17:51:37.868Z`
- State status: `pending`
- consumed_at: `null`
- redirect_uri: `http://localhost:4000/v1/integrations/google/oauth/callback`
- connection_id: `f27dc794-03d5-4925-aa38-52a0cb1f79bb`

Configured TTL from code at the time of proof:
- State creation uses a fixed `10 * 60 * 1000` milliseconds at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L314)
- Calculated TTL from persisted timestamps: `599.995` seconds

Callback validation logic:
- Expiry value is read at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L397)
- Exact comparison is at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L398)
- Throw site is at [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L399)

## Requested fields

- OAuth state: `go_f963497c609f45a389cd4cb0e65bc674_8118baf838454d628b16a6849c6c0edd`
- State created_at: `2026-07-01T17:41:37.873Z`
- Callback received_at: `NOT RECOVERABLE FROM PERSISTED RUNTIME EVIDENCE`
- Calculated age (seconds): `NOT PROVABLE FOR THE REAL CALLBACK` 
- Configured TTL: `599.995` seconds (`10 * 60 * 1000` ms)
- Validation result: `REAL CALLBACK EXPIRATION NOT PROVEN`
- Exact comparison that failed: `Number.isNaN(expiresAt) || expiresAt <= Date.now()`
- Exception stack from later replay against the stale state:
```text
Error: GOOGLE_OAUTH_STATE_EXPIRED
    at GoogleOAuthService.completeAuthorization (/Users/dheyahagar/Documents/madar-platform/pulse-ui-next/src/identity-platform/google-oauth/service.ts:399:13)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async file:///Users/dheyahagar/Documents/madar-platform/pulse-ui-next/[eval1]:39:3
```
- File: [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L399)
- Line: `399`

## What is actually proven

1. The stored OAuth state had a 10-minute TTL.
2. The stored OAuth state remained `pending` and `unconsumed`.
3. A later replay of `completeAuthorization(...)` against that same stored state throws `GOOGLE_OAUTH_STATE_EXPIRED`.
4. The backend does not persist a `callback received_at` timestamp for that callback.
5. The currently available runtime evidence does not include a request log entry tying the real callback receipt time to this exact OAuth state.

## What is not proven

- The exact `callback received_at` for the latest real callback.
- The exact age of the state at the moment the latest real callback was received.
- That the latest real callback was actually older than the configured TTL when received.

## Answer

Was the latest real callback actually older than the configured TTL?

NO.

Reason:
- The real callback receipt timestamp is not available in persisted runtime evidence.
- Therefore expiration of the real callback is not proven.
- Only a later replay against the same stale state is proven to fail the expiry check.

## Action taken

- Reverted the speculative TTL change in [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts).
- Revalidated the OAuth service slice with `npm run test -- src/identity-platform/tests/google-oauth.service.test.ts` (`7/7` passing).
