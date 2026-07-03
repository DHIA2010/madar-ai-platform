# WORKSPACE_RUNTIME_VERIFICATION

Date: 2026-06-28
Mode: Read-only verification

## Scope

Verification target: why browser runtime still sends invalid `workspaceId` in `POST /v1/integrations/google/oauth/start`.

No code changes were made.

## 1) Is modified code actually being executed?

Yes.

Evidence from live served frontend bundle:
- Frontend is running in dev/Turbopack mode (live source bundles served from `/_next/static/chunks/...`).
- Active infrastructure bundle contains updated `provider.tsx` logic:
  - UUID regex exists in compiled bundle.
  - `workspace-context` localStorage read exists in compiled bundle.
  - UUID guard `UUID_PATTERN.test(workspaceId) ? workspaceId : null` exists in compiled bundle.

Runtime snippet found in compiled chunk:
- `/_next/static/chunks/src_infrastructure_20ff9766._.js`
- includes:
  - `const UUID_PATTERN = /^[0-9a-f]{8}-...$/i;`
  - `window.localStorage.getItem("workspace-context")`
  - `return UUID_PATTERN.test(workspaceId) ? workspaceId : null;`

Conclusion: updated provider implementation is in the running runtime.

## 2) Is running frontend built from latest source?

Yes.

Evidence:
- `http://localhost:3000` response includes Turbopack dev HMR scripts.
- Served bundle contains current source behavior, not stale production build output.

Conclusion: not a stale frontend build.

## 3) Is provider.tsx using new implementation or old compiled version?

New implementation.

Evidence:
- Source file has UUID guard in [src/infrastructure/provider.tsx](src/infrastructure/provider.tsx#L23).
- Compiled live chunk contains matching UUID guard logic.

Conclusion: not an old provider version.

## 4) Exact workspaceId value being sent in failing request

Current failing value: `ws_northstar_marketing`.

Runtime evidence chain:
- Backend returns `workspaceId` UUID validation failure (400).
- In the known failing runtime trace, payload used `workspaceId: "ws_northstar_marketing"`.
- Request body construction passes `workspaceId` through unchanged in [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L259).

## 5) Trace value back to source

Source path:
1. Wizard reads current workspace id:
   - [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432)
2. Wizard passes it to createConnection:
   - [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L557)
3. Connection manager forwards unchanged:
   - [src/application/services/connection-management.service.ts](src/application/services/connection-management.service.ts#L310)
4. Integration repository POST body uses unchanged `input.workspaceId`:
   - [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L259)

Workspace context persistence source:
- Zustand persisted key `workspace-context` stores `currentWorkspace` and `customWorkspaces`:
  - [src/features/workspace/state/workspace.store.ts](src/features/workspace/state/workspace.store.ts#L86)
  - [src/features/workspace/state/workspace.store.ts](src/features/workspace/state/workspace.store.ts#L89)

Selection behavior keeps stale persisted workspace if id matches:
- [src/features/workspace/providers/workspace-provider.tsx](src/features/workspace/providers/workspace-provider.tsx#L109)

## 6) Which runtime condition is responsible?

Primary cause: stale browser storage/localStorage workspace context.

Classification:
- stale frontend build: No
- stale browser storage: Yes
- stale localStorage: Yes
- old provider instance: No
- old workspace repository: No (current source path shows API-by-default except explicit mock mode)
- different code path: No (same wizard->service->repository path)

Why provider UUID guard did not solve this payload:
- Provider UUID guard applies to `getWorkspaceIdFromStorage` used in repository HTTP interceptors/tenant metadata.
- OAuth start payload workspaceId comes from wizard `currentWorkspace?.id`, not from provider interceptor.
- So stale `currentWorkspace.id` in persisted workspace state can still propagate into request body.
