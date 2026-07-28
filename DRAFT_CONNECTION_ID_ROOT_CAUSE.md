# DRAFT_CONNECTION_ID_ROOT_CAUSE

Scope: draftConnectionId only.

## 1) Every assignment to draftConnectionId

Assignments found in [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx):

1. Callback initializer effect:
- `setDraftConnectionId(resolvedConnectionId)`
- location: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L568)
- source: OAuth callback params and fallback reference.

2. OAuth start flow:
- `setDraftConnectionId(connectionId)`
- location: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L722)
- source: created or existing connection id during beginOAuthFlow.

## 2) Every place that clears it

1. Platform toggle reset:
- `setDraftConnectionId(null)`
- location: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L853)

No other explicit clear exists in this component.

## 3) Every place that reads it

Reads found in [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx):

1. finalize guard:
- `if (!selectedConnector || !draftConnectionId) return`
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L753)

2. schedule sync uses it:
- `connectionId: draftConnectionId`
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L763)

3. run first sync guard:
- `if (!draftConnectionId) return`
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L901)

4. run first sync call:
- `connectionId: draftConnectionId`
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L907)

5. Create button disabled gate at Review:
- `(stepIndex === 3 && !draftConnectionId)`
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L1804)

## 4) Function that is supposed to create it

Primary creator flow:
- `beginOAuthFlow` in [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L663)
- behavior:
  - finds existing reference or creates a new connection,
  - then sets draft id via `setDraftConnectionId(connectionId)`.

Post-callback recovery flow:
- callback effect `loadAccessibleAccounts` in [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L567)
- now sets from callback id or fallback reference.

## 5) Why it was still null after successful OAuth

Root cause in callback initializer precondition:
- old logic required URL param `google_connection_id`; if missing, effect returned early and never assigned draftConnectionId.
- early return condition was in callback effect before assignment.

This left Review reachable from Import via `setStepIndex(3)` while Create stayed disabled by `!draftConnectionId`.

## 6) Which Promise should assign it

Promise:
- `loadAccessibleAccounts()` callback initializer Promise in the OAuth callback effect.
- invocation: `void loadAccessibleAccounts()` at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L609)
- expected assignment point: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L568)

## 7) Whether that Promise never starts / throws / returns null / swallowed / skipped

For the missing draft case:
- classification: skipped by a condition.
- skip condition: missing `google_connection_id` caused early return from callback effect before Promise execution.

## Fix applied (draft creation only)

File changed:
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx)

Change:
- callback initializer now resolves connection id as:
  - `google_connection_id` from callback query, or
  - fallback from stored connection references for Google Ads connector.
- if either is present, it assigns `setDraftConnectionId(resolvedConnectionId)` and proceeds.

New logic region:
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L553)
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L568)

Validation:
- no TypeScript/diagnostic errors in updated file.
