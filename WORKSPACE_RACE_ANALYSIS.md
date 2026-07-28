# WORKSPACE_RACE_ANALYSIS

Date: 2026-06-28
Scope: Read-only investigation of [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx) only

## Lifecycle Trace of currentWorkspace

### 1) Component mount and initial render

- Workspace source hook is read at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L407):
  - const { currentWorkspace } = useWorkspace()
- Derived value is computed during render at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432):
  - const workspaceId = currentWorkspace?.id ?? null

Implication:
- On first render, workspaceId is whatever currentWorkspace is at that render (possibly null, stale, or final).

### 2) State initialization

- useState initializers in this file do not initialize currentWorkspace/workspaceId.
- workspaceId is not local state; it is a render-time derived value from currentWorkspace.

Implication:
- No local state in this file can keep an old workspaceId independently.

### 3) Effects

- useEffect blocks in this file manage connector/object/account defaults.
- None of these effects writes workspaceId or currentWorkspace.

Implication:
- Effects in this file are not mutating workspace selection.

### 4) Callbacks and closure behavior

- OAuth starter callback is declared at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L538).
- Dependency array includes workspaceId at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L620).

Implication:
- When workspaceId changes between renders, beginOAuthFlow is recreated with the new workspaceId.
- This is not a stale-closure pattern caused by missing dependencies.

### 5) beginOAuthFlow request body value

- OAuth request is built at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L556).
- The exact field assignment is at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L557):
  - workspaceId,

Runtime value at this exact line:
- The value sent is the callback-scoped workspaceId captured from the latest committed render that produced this beginOAuthFlow instance.
- Since workspaceId is defined as currentWorkspace?.id ?? null at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432), the request uses that resolved value for that render.

## Direct Answers

1. Is beginOAuthFlow using the latest currentWorkspace?
- Yes, for the latest committed render. beginOAuthFlow depends on workspaceId and is recreated when workspaceId changes.

2. Is the callback closing over an old value?
- Not due to missing dependencies. It closes over the workspaceId from the render that created it.

3. Is useCallback/useMemo preserving a stale workspace reference?
- No stale reference bug found in this file. workspaceId is included in beginOAuthFlow dependencies.

4. At the exact line that builds the OAuth request body, print the runtime value of currentWorkspace.id.
- Exact line: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L557)
- Runtime value used there: workspaceId (derived from currentWorkspace?.id at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432)).

5. Determine whether a race condition exists between workspace loading and OAuth click.
- Yes, a timing race is possible at UI interaction level:
  - If user clicks Continue while UI is still on an earlier committed render, beginOAuthFlow can use that render's workspaceId.
  - After workspace updates and a new render commits, subsequent clicks use the new workspaceId.
- This is a render-timing race possibility, not a stale-dependency closure defect in this file.

## Final

Workspace at first render:
- currentWorkspace?.id at first committed render (can be null or pre-update value)

Workspace before button click:
- currentWorkspace?.id from the most recent committed render before click

Workspace used in request:
- workspaceId at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L557)

Is stale closure present?

NO

Race condition?

YES

File:

[src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx)

Line:

[src/features/integrations/components/new-connection-wizard.tsx#L557](src/features/integrations/components/new-connection-wizard.tsx#L557)
