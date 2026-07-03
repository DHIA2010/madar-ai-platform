# WORKSPACE_ID_SOURCE_TRACE

Date: 2026-06-28
Scope: Frontend-only workspaceId source trace (no backend validation analysis)

## Trace Chain (Requested Path)

1. Provider wiring
- [src/infrastructure/provider.tsx](src/infrastructure/provider.tsx#L23): `getWorkspaceIdFromStorage()` reads localStorage key `workspace-context`.
- [src/infrastructure/provider.tsx](src/infrastructure/provider.tsx#L28): reads `window.localStorage.getItem("workspace-context")`.
- [src/infrastructure/provider.tsx](src/infrastructure/provider.tsx#L35): extracts `parsed.state?.currentWorkspace?.id`.
- [src/infrastructure/provider.tsx](src/infrastructure/provider.tsx#L67): passes this function into integration repository client options.

2. Integration repository
- [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L246): `createConnection(input)` receives DTO.
- [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L259): request body sets `workspaceId: input.workspaceId`.
- Outcome: repository forwards `workspaceId` unchanged into OAuth start HTTP body.

3. Connection manager service
- [src/application/services/connection-management.service.ts](src/application/services/connection-management.service.ts#L309): `createConnection(input)`.
- [src/application/services/connection-management.service.ts](src/application/services/connection-management.service.ts#L310): forwards directly via `integrationGateway.createConnection(input)`.
- Outcome: no transformation of `workspaceId`.

4. New connection wizard
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432): `const workspaceId = currentWorkspace?.id ?? null`.
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L557): sends that value in `connectionManager.createConnection({ workspaceId, ... })`.
- Outcome: value source is `currentWorkspace.id` from workspace context store.

5. HTTP request body
- [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L258): POST `/v1/integrations/google/oauth/start`.
- [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L259): body contains `workspaceId: input.workspaceId`.

## Where workspaceId is first created/read

First concrete non-UUID value definition in frontend data:
- [src/infrastructure/workspace/mock-workspace-data.ts](src/infrastructure/workspace/mock-workspace-data.ts#L62): `id: "ws_northstar_marketing"` in `mockWorkspaces`.

Where it is read into runtime context:
- [src/features/workspace/state/workspace.store.ts](src/features/workspace/state/workspace.store.ts#L86): store persists under localStorage key `workspace-context`.
- [src/infrastructure/provider.tsx](src/infrastructure/provider.tsx#L35): provider reads `state.currentWorkspace.id` from that localStorage state.
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432): wizard reads `currentWorkspace.id`.

## Exact value assigned

Observed value path and runtime payload value:
- `ws_northstar_marketing`

Evidence of literal source:
- [src/infrastructure/workspace/mock-workspace-data.ts](src/infrastructure/workspace/mock-workspace-data.ts#L62)

## Source classification (requested categories)

Current source is:
- Workspace object: `currentWorkspace.id` in wizard.
- Local storage: persisted Zustand state `workspace-context`.
- Mock value: ID literal comes from mock workspace dataset.

Not sourced from:
- Session
- Auth provider
- URL
- Organization object
- Hardcoded inside wizard/repository request code

## Why it is not a UUID

Because the frontend workspace id value itself is formatted as a mock identifier (`ws_northstar_marketing`), not a UUID string.

## Correct source should be

`workspaceId` in OAuth start body should come from the active real workspace entity identifier (UUID) in tenant context, not from mock workspace IDs persisted in `workspace-context`.

Practically in this chain, that means `currentWorkspace.id` must be a UUID-backed workspace id from the runtime workspace context, not mock fixture ids.

## Final Determination

The incorrect source is the frontend workspace context carrying mock workspace IDs (persisted in localStorage and read into `currentWorkspace.id`), then passed unchanged through wizard -> connection manager -> integration repository -> request body.
