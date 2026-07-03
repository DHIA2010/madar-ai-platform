# Run Sync randomUUID Runtime Fix

## Scope

Investigation and fix are limited to the runtime error:
- `randomUUID is not a function`

No sync business logic was changed.
No sync flow behavior was changed.
Only UUID generation was replaced at the failing runtime boundary.

## 1) Every usage of `randomUUID()`

Search scope: workspace source files (`src/**/*.ts`, `src/**/*.tsx`, etc.).

### `src/infrastructure/data/repositories/integration.repository.ts`
- `eventId: randomUUID()` (before fix)
- `idempotencyKey: randomUUID()` in `RestIntegrationRepository.runSync` (before fix)

### `src/project-platform/service.ts`
- multiple occurrences including `eventId`, `id`, `token`, and fallback idempotency key

### `src/identity-platform/interfaces/middleware/index.ts`
- request id fallback generation

### `src/backend-foundation/request-context.ts`
- request id fallback generation

### `src/integration-platform/service.ts`
- multiple entity/event id generations

### `src/integration-platform/domain/entities/index.ts`
- id generation

### `src/integration-platform/infrastructure/sync/sync-engine.ts`
- sync entity id generation

### `src/backend-foundation/infrastructure-layer.ts`
- UUID provider return

### `src/integration-platform/infrastructure/oauth/oauth-engine.ts`
- multiple OAuth entity id generations

### `src/integration-platform/bootstrap/create-integration-platform.ts`
- bootstrap id and crypto seed generation use-sites

### `src/integration-platform/infrastructure/webhook/webhook-engine.ts`
- webhook entity id generation

### `src/identity-platform/dependency-injection/container.ts`
- UUID provider return

### `src/identity-platform/google-ads/repository.ts`
- multiple row/entity/lock token id generations

### `src/identity-platform/google-oauth/service.ts`
- token/state id generation

### `src/identity-platform/google-oauth/repository.ts`
- multiple event/log id generations

### `src/identity-platform/infrastructure/storage/in-memory.ts`
- id fallback generation

### `src/application/tracking-api/tracking-controller.ts`
- request id generation for tracking endpoints

### `src/project-platform/bootstrap/create-project-platform.ts`
- bootstrap id generation

## 2) Every import of `randomUUID`, `crypto`, `crypto-browserify`

### Imports of `randomUUID`
All found imports use `node:crypto`:
- `src/identity-platform/interfaces/middleware/index.ts`
- `src/project-platform/service.ts`
- `src/infrastructure/data/repositories/integration.repository.ts` (removed by this fix)
- `src/project-platform/bootstrap/create-project-platform.ts`
- `src/backend-foundation/request-context.ts`
- `src/backend-foundation/infrastructure-layer.ts`
- `src/integration-platform/service.ts`
- `src/integration-platform/domain/entities/index.ts`
- `src/integration-platform/bootstrap/create-integration-platform.ts`
- `src/integration-platform/infrastructure/sync/sync-engine.ts`
- `src/integration-platform/infrastructure/oauth/oauth-engine.ts`
- `src/integration-platform/infrastructure/webhook/webhook-engine.ts`
- `src/application/tracking-api/tracking-controller.ts`
- `src/identity-platform/dependency-injection/container.ts`
- `src/identity-platform/infrastructure/storage/in-memory.ts`
- `src/identity-platform/google-oauth/service.ts` (named import list includes `randomUUID`)
- `src/identity-platform/google-oauth/repository.ts`
- `src/identity-platform/google-ads/repository.ts`

### Imports of `crypto`
Found explicit crypto imports are also `node:crypto` (or default alias from it):
- `src/identity-platform/tests/google-ads.auth-provider.test.ts` (`import crypto from "node:crypto"`)
- plus non-randomUUID crypto function imports from `node:crypto` across backend/server modules.

No direct source import `from "crypto"` was found in user source files.

### Imports of `crypto-browserify`
No direct source import of `crypto-browserify` was found.

## 3) Why Next.js browser runtime resolves to `next/dist/compiled/crypto-browserify`

`RestIntegrationRepository` is consumed by client-side code paths (via app client bundles and providers/hooks used in the browser runtime).

When a client bundle includes code that imports `node:crypto` APIs, Next/Turbopack cannot ship Node core modules directly to the browser.

So Next substitutes its browser-compatible compiled shim package:
- `next/dist/compiled/crypto-browserify`

This is visible in generated artifacts such as:
- `.next/dev/static/chunks/node_modules_next_dist_compiled_crypto-browserify_index_*.js`
- client reference manifests that include that chunk.

`crypto-browserify` does not provide `randomUUID()` as a Node runtime equivalent in this path, so calling imported `randomUUID` can fail at runtime as:
- `randomUUID is not a function`

## 4) Exact file and line throwing the error

Throwing call site in Run Sync path:
- `src/infrastructure/data/repositories/integration.repository.ts` at previous line where `idempotencyKey: randomUUID()` was executed inside `RestIntegrationRepository.runSync`.

Current fixed line:
- `src/infrastructure/data/repositories/integration.repository.ts:444`
- now uses `idempotencyKey: generateUuid()`.

Related stack path remains:
- `RestIntegrationRepository.runSync`
- `ConnectionManager.runSync`
- `useConnectionsCenter.runSync`

## 5) UUID-only replacement applied (browser-compatible)

### File changed
- `src/infrastructure/data/repositories/integration.repository.ts`

### Minimal change summary
- Removed `import { randomUUID } from "node:crypto"` from this browser-reachable repository.
- Added local `generateUuid()` helper with browser-safe priority:
  1. `globalThis.crypto.randomUUID()` when available.
  2. RFC4122 v4-compatible generation via `globalThis.crypto.getRandomValues()`.
  3. Last-resort non-crypto fallback string if Web Crypto is unavailable.
- Replaced only UUID call sites in this file:
  - `eventId` generation in `appendEvent`.
  - `idempotencyKey` generation in `runSync`.

### What was NOT changed
- No API shape changes.
- No sync request payload fields changed except UUID source function.
- No control flow, retries, status handling, or business logic changes.

## Validation

- Type/errors check for changed file: no errors.
- The fix directly removes browser dependency on `node:crypto` randomUUID in the failing Run Sync client path.
