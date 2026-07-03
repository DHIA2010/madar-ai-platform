# WORKSPACE_CONTEXT_FIX

Date: 2026-06-28

## Files Changed

- [src/infrastructure/data/repositories/workspace.repository.ts](src/infrastructure/data/repositories/workspace.repository.ts)
- [src/infrastructure/provider.tsx](src/infrastructure/provider.tsx)

## Mock Dependency Removed

What changed:
- Removed direct/static runtime dependency on workspace mock fixtures from production workspace repository flow.
- Workspace repository now uses API-backed workspace resolution by default and only uses mock workspace gateway in explicit mock mode.
- Mock gateway is lazy-loaded only when `APP_RUNTIME_MODE === "mock"`.

Evidence:
- Explicit mode gate: [src/infrastructure/data/repositories/workspace.repository.ts#L28](src/infrastructure/data/repositories/workspace.repository.ts#L28)
- Lazy mock import (mock-only path): [src/infrastructure/data/repositories/workspace.repository.ts#L33](src/infrastructure/data/repositories/workspace.repository.ts#L33)
- API path preserved for non-mock runtime: [src/infrastructure/data/repositories/workspace.repository.ts#L52](src/infrastructure/data/repositories/workspace.repository.ts#L52)

## New Workspace Source

Workspace id source in runtime is now:
- Authenticated workspace context resolved through workspace API repository (non-mock runtime), then consumed by workspace context state.
- Provider-level workspace id extraction now rejects non-UUID stale values from persisted storage.

Evidence:
- UUID guard in provider extraction: [src/infrastructure/provider.tsx#L23](src/infrastructure/provider.tsx#L23)
- Workspace id read from persisted context and validated: [src/infrastructure/provider.tsx#L26](src/infrastructure/provider.tsx#L26)
- UUID-only pass-through from storage reader: [src/infrastructure/provider.tsx#L43](src/infrastructure/provider.tsx#L43)

## Final Request Payload Example

OAuth start payload using backend-issued runtime workspace UUID:

```json
{
  "workspaceId": "edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9",
  "projectId": null,
  "connectionName": "Google Ads Connection"
}
```

## End-to-End Verification

1. Type check
- Command: `npm run typecheck`
- Result: PASS

2. Backend validation remains strict (unchanged)
- Invalid id payload (`ws_northstar_marketing`) to POST `/v1/integrations/google/oauth/start`
- Result: HTTP 400 `VALIDATION_ERROR` with `workspaceId invalid_format`

3. OAuth start with valid UUID workspace id
- Pulled runtime UUID from authenticated `GET /v1/workspaces`
- Sent POST `/v1/integrations/google/oauth/start` with UUID payload
- Result: no longer HTTP 400 validation failure
- Current response in this environment: HTTP 500 `INTERNAL_ERROR`

4. Browser redirect to Google OAuth
- Not completed in this run because OAuth start returned 500 before redirect response could be issued.

5. OAuth callback completion
- Not completed in this run due upstream OAuth start 500 blocker.

6. Google Ads connection creation
- Not completed in this run due upstream OAuth start 500 blocker.

## Verification Summary

- The workspaceId validation failure source was fixed on frontend runtime wiring.
- POST `/v1/integrations/google/oauth/start` with UUID no longer fails with HTTP 400 `Invalid UUID`.
- Remaining blocker is an infrastructure/runtime 500 in OAuth start path, unrelated to workspaceId format validation.
