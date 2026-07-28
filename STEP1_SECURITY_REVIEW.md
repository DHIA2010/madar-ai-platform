# STEP1 Security Review - Backend Google OAuth

## Scope
This review covers only Step 1 backend capability:
- POST /v1/integrations/google/oauth/start
- GET /v1/integrations/google/oauth/callback

Explicitly out of scope:
- frontend/UI
- account discovery
- project/workspace/org status updates
- sync/import pipelines

## Findings

### Critical Findings Fixed
1. Callback error information leak risk.
- Before: callback redirect could include raw internal exception messages as `reason` query string.
- Risk: leaking SQL/runtime internals to user-facing URL and logs.
- Fix: introduced strict internal-to-safe error mapping and generic fallback in callback controller.
- Evidence: `src/identity-platform/google-oauth/controller.ts`.

2. Replay/race safety and atomicity gap in callback persistence.
- Before: state consumption and persistence were separate operations; race windows could process callback twice under concurrency.
- Risk: duplicate side-effects and weaker replay guarantees.
- Fix:
  - added conditional one-time consume (`status='pending'`, `consumed_at IS NULL`, `expires_at > now`) returning success flag.
  - wrapped consume + connection upsert + lifecycle writes in one DB transaction.
- Evidence: `src/identity-platform/google-oauth/repository.ts`, `src/identity-platform/google-oauth/service.ts`.

3. Weak encryption key acceptance.
- Before: long strings were silently truncated to 32 chars.
- Risk: accidental weak/misconfigured keys and non-obvious key material changes.
- Fix: require exact valid 32-byte material (hex/base64/32-char raw) and fail closed.
- Evidence: `src/identity-platform/google-oauth/service.ts`.

### High Findings Fixed
4. Missing strict validation for provider token response.
- Before: token response accepted without requiring `access_token` presence.
- Risk: invalid provider response could proceed unpredictably.
- Fix: enforce `access_token` presence/type and hard-fail token exchange otherwise.
- Evidence: `src/identity-platform/google-oauth/service.ts`.

5. Missing refresh token requirement at initial connect.
- Before: callback could mark connection connected even with null refresh token.
- Risk: non-refreshable connection record despite expected offline access.
- Fix: require refresh token for completion; fail with mapped safe reason if missing.
- Evidence: `src/identity-platform/google-oauth/service.ts`.

6. Scope validation was absent.
- Before: any provider-returned scope set was accepted.
- Risk: under-scoped token accepted as connected.
- Fix: enforce required business-critical scope (`https://www.googleapis.com/auth/adwords`) in granted scopes.
- Evidence: `src/identity-platform/google-oauth/service.ts`.

### Medium Findings Fixed
7. Connection start idempotency gap per project/provider.
- Before: each start tried creating new connection ID; repeated starts on same project could violate unique project/provider constraint.
- Risk: duplicate callback/start instability and operational failures.
- Fix: reuse existing active project/provider connection ID when starting OAuth.
- Evidence: `src/identity-platform/google-oauth/repository.ts`, `src/identity-platform/google-oauth/service.ts`.

8. OpenAPI Step 1 endpoint accuracy was minimal.
- Before: only endpoint summaries.
- Fix: added response/status and callback parameter details for Step 1 endpoints.
- Evidence: `src/identity-platform/interfaces/openapi/identity-openapi-spec.ts`.

## Security Checklist Verification
- OAuth Authorization Code Flow: implemented and tested.
- State entropy: high entropy state (`randomBytes` + UUID).
- State expiration: enforced at callback.
- Replay attack protection: one-time conditional state consume + duplicate callback test coverage.
- CSRF protection: state parameter required and validated server-side.
- Refresh token handling: required for successful completion and encrypted before storage.
- Token encryption: AES-256-GCM with explicit key normalization and strict configuration checks.
- Secret management: no hardcoded runtime secrets in service logic; env-based configuration used.
- Redirect URI validation: configured redirect URLs parsed and protocol/host policy validated.
- Scope validation: required adwords scope enforcement.
- Error handling: safe callback reason mapping; no raw internal error leak in redirect URLs.
- Audit logging: start/completed lifecycle writes to audit + events/outbox.
- Database transactions: callback consume + persistence + lifecycle writes wrapped in one transaction.
- Idempotency: project-level connection reuse at start; one-time state consume at callback.
- Retry behavior: transient provider failures do not consume state; callback can retry while state remains pending and unexpired.
- Logging secrets: no explicit token logging introduced; redirect errors sanitized.
- HTTP status codes:
  - start: 200 on success, 400 validation, 401 auth required
  - callback: 302 redirect success/error, 503 unavailable mode
- OpenAPI accuracy: Step 1 paths documented with status/params.

## Persistence Review
- Tokens encrypted before persistence: verified in service tests and SQL queries.
- Refresh token rotation support: schema and upsert logic allow replacing encrypted refresh token per callback.
- Connection records idempotent: project/provider connection reuse + upsert on connection ID.
- Duplicate callbacks: second callback fails safely with state error redirect.
- Atomicity: callback side effects executed in a transaction.

## Added/Updated Tests (Security Coverage)
- `src/identity-platform/tests/google-oauth.service.test.ts`
  - invalid state
  - expired state
  - duplicate callback replay
  - invalid authorization code/token exchange failure
  - missing refresh token
  - missing required scope
  - DB write failure path
  - encryption key configuration failure
- `src/identity-platform/tests/google-oauth.http.test.ts`
  - safe error reason mapping in callback redirects
  - duplicate callback HTTP behavior

## Validation Results
Executed and passed:
- npm run lint
- npm run typecheck
- npm test
- npm run build
- npm run identity:openapi
- npm run identity:migrations:validate

## Remaining Risks
1. No outbound retry/backoff policy for Google token/userinfo calls beyond request-level failure handling.
2. No explicit provider nonce parameter handling (not required for this server-side OAuth code exchange use case, but can be considered if ID-token validation becomes part of flow).
3. Callback success redirect still includes non-secret account metadata in query parameters; acceptable for current step but should be reviewed if stricter privacy constraints are required.

## Production Readiness Assessment
Is Step 1 production-ready as a standalone backend capability?

Answer: Yes, with the current scope and controls, Step 1 is production-ready as a standalone backend OAuth capability.

Evidence:
- security-critical issues identified in this review were fixed (error leakage, replay/atomicity, key validation, scope/refresh enforcement, idempotency);
- negative-path security tests were added and pass;
- full quality and build gates pass;
- OpenAPI and migration validations pass.
