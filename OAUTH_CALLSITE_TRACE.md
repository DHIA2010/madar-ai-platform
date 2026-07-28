# OAUTH_CALLSITE_TRACE

Date: 2026-06-28
Mode: Read-only frontend callsite trace

## Endpoint Under Trace

`POST /v1/integrations/google/oauth/start`

## 1. All frontend code paths capable of invoking this endpoint

### Runtime app path (active)

1. UI action:
- Open New Connection wizard
- Select a connector (Google Ads or other card)
- Click Continue to platform
- Click Continue to OAuth

2. Call chain:
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L556)
  - `connectionManager.createConnection({ workspaceId, ... })`
- [src/application/services/connection-management.service.ts](src/application/services/connection-management.service.ts#L310)
  - forwards to integration gateway
- [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L258)
  - executes POST `/v1/integrations/google/oauth/start`

3. Workspace source for this path:
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432)
  - `const workspaceId = currentWorkspace?.id ?? null`

### Test-only paths (not runtime UI)

- [src/identity-platform/tests/google-oauth.http.test.ts](src/identity-platform/tests/google-oauth.http.test.ts#L124)
- [src/identity-platform/tests/google-oauth.http.test.ts](src/identity-platform/tests/google-oauth.http.test.ts#L254)
- [src/identity-platform/tests/google-oauth.http.test.ts](src/identity-platform/tests/google-oauth.http.test.ts#L342)

These are test fetch calls; no production UI action uses them.

## 2. Legacy/alternate OAuth flows check

### Legacy integration-platform route exists (backend), but not used by current frontend

- Backend legacy route:
  - `POST /v1/connections/{connectionId}/oauth/start`
  - [src/integration-platform/interfaces/rest/server.ts](src/integration-platform/interfaces/rest/server.ts#L76)
- Service method exists:
  - [src/integration-platform/service.ts](src/integration-platform/service.ts#L134)

Frontend usage scan result:
- No frontend references to `/v1/connections/{connectionId}/oauth/start`
- No frontend `startOAuth` invocation path found.

Conclusion:
- Old/legacy OAuth flow is present server-side but inactive from frontend runtime.

## 3. Multiple repository/service exposure check

- Integration repository implementation in frontend runtime:
  - [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L158)
  - only implementation: `RestIntegrationRepository`
- Factory always returns that implementation:
  - [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L643)
- No second frontend repository class with alternate `/google/oauth/start` call path.

## 4. Which path sends UUID vs ws_northstar_marketing?

There is one active frontend runtime callsite (New Connection wizard path).

That single path can send either value depending on `currentWorkspace.id` at runtime:
- Sends UUID when workspace context is UUID.
- Sends `ws_northstar_marketing` when workspace context is stale/mock.

No separate second active frontend callsite was found that uniquely sends `ws_northstar_marketing`.

## Final

Call Site #1

File:
[src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx)

Line:
[src/features/integrations/components/new-connection-wizard.tsx#L556](src/features/integrations/components/new-connection-wizard.tsx#L556)

Workspace source:
`currentWorkspace?.id` from workspace context at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432)

Uses UUID: YES/NO
YES when current workspace is UUID; NO when current workspace is stale/mock (`ws_northstar_marketing`)

---
Call Site #2

File:
[src/identity-platform/tests/google-oauth.http.test.ts](src/identity-platform/tests/google-oauth.http.test.ts)

Line:
[src/identity-platform/tests/google-oauth.http.test.ts#L124](src/identity-platform/tests/google-oauth.http.test.ts#L124)

Workspace source:
Test fixture value in test setup/body

Uses UUID: YES/NO
YES (test fixture uses UUID)

---
Root cause:
No separate active legacy frontend OAuth path is sending `ws_northstar_marketing`; the same active wizard call path sends it only when `currentWorkspace.id` in runtime context is that non-UUID value.