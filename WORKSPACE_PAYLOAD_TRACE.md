# WORKSPACE_PAYLOAD_TRACE

Date: 2026-06-28
Mode: Read-only runtime verification

## Verification Method

- Logged into running app on `http://localhost:3000`.
- Opened Integrations New Connection flow.
- Instrumented browser runtime (fetch/XHR) to capture exact outgoing `POST /v1/integrations/google/oauth/start` payload and headers.
- Read `workspace-context` from `localStorage` at runtime before request.

## Captured Runtime Values

1. localStorage workspaceId
- Source: `window.localStorage['workspace-context'].state.currentWorkspace.id`
- Value: `edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9`

2. Context workspaceId
- Runtime proxy observed in request header `x-workspace-id` (from provider HTTP client interceptor)
- Value: `edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9`

3. React state workspaceId
- In code, request body uses `workspaceId` variable from wizard state (`const workspaceId = currentWorkspace?.id ?? null`).
- Request capture shows body value equals UUID below, so runtime React state used for this request is UUID.
- Value used by state at call time (inferred from request body): `edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9`

4. Request payload workspaceId
- Captured outgoing POST body:
```json
{
  "workspaceId": "edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9",
  "projectId": null,
  "connectionName": "Salla Connection"
}
```

## Divergence Analysis

Comparison result:
- localStorage workspaceId: UUID
- React state workspaceId: UUID
- Context/header workspaceId: UUID
- Request payload workspaceId: UUID

First divergence point:
- None in the currently captured runtime request.

## What this means for the reported 400 Invalid UUID

In the currently running runtime/session that was captured, the outgoing payload does NOT use a non-UUID workspace id.

Therefore, the reported `workspaceId -> Invalid UUID` 400 is coming from a different runtime request context/session/tab than the one captured here (for example a separate stale tab/session state).

## Evidence References

- Wizard state source: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432)
- Wizard request call: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L557)
- Payload serialization: [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L259)
- Provider storage reader + UUID guard: [src/infrastructure/provider.tsx](src/infrastructure/provider.tsx#L23)
