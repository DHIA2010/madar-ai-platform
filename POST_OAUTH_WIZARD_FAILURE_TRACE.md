# POST_OAUTH_WIZARD_FAILURE_TRACE

Scope: frontend wizard flow immediately after OAuth callback on /integrations/new.

## Post-callback entry point

Callback handling starts in this effect:
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L541)
- It requires query params: `google_oauth=connected` and `google_connection_id`.

When present, it runs `loadAccessibleAccounts()` and sets:
- `setDraftConnectionId(callbackConnectionId)` at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L560)
- `setFlowStatus("fetching_accounts")` at [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L561)

## 1) Every API request executed after OAuth callback (in this wizard flow)

Ordered sequence from callback effect:

1. `integrationApplicationService.validateConnection({ connectionId })`
- call site: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L564)
- stack: `validateConnection` service/use-case/query delegates to repository validateConnection
  - [src/application/services/integration-application.service.ts](src/application/services/integration-application.service.ts#L77)
  - [src/application/use-cases/validate-connection.use-case.ts](src/application/use-cases/validate-connection.use-case.ts#L17)
  - [src/application/queries/integration.queries.ts](src/application/queries/integration.queries.ts#L37)

2. Inside repository validateConnection, conditional HTTP request:
- `GET /v1/integrations/google-ads/accounts?connectionId=...`
- call site: [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L327)
- this request is attempted only inside callback-connected branch after local `getConnectionOrThrow` succeeds.

No other HTTP request is issued by the callback effect before banner/state decisions.

## 2) Response code of each request

1. `validateConnection(...)` (application-layer call):
- not an HTTP response itself; it is a Promise that may resolve/reject.

2. `GET /v1/integrations/google-ads/accounts`:
- if successful: expected `200` with `items` payload.
- if non-2xx/network failure: repository catches and swallows it, sets `accessibleAccounts = []`, and continues.
  - swallow behavior: [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L344)

Because of this swallow, response code is not propagated to wizard error state.

## 3) Which request fails

The red banner path is not tied to a failing `/google-ads/accounts` HTTP request.

Banner path requires `validateConnection(...)` itself to reject (outer catch in callback effect).
That rejection can happen before any HTTP request in repository validateConnection (for example local precondition failures), and only then the wizard sets error state.

Outer catch:
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L598)

## 4) Which request sets the "Connection setup failed" state

No HTTP request directly sets that title.

The title is produced by this mapping:
- generic error meta title: "Connection setup failed"
  - [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L375)

Assignment happens when callback effect catches any thrown error and maps to generic kind:
- message extraction + kind inference + state assignment:
  - [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L598)
  - [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L600)

## 5) Where connectionError is assigned

There is no variable named `connectionError` in this component.

Equivalent error state is `errorState`:
- declaration: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L453)
- assignments:
  - callback effect catch: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L600)
  - beginOAuthFlow catch: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L724)
  - finalizeConnection catch: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L769)

## 6) Why wizard is allowed to continue even though setupFailed=true

`setupFailed=true` corresponds to `errorState !== null` (error card path).

While `errorState` exists:
- step content becomes error card: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L1766)
- normal continue handler is blocked early: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L776)

But error card provides explicit escape action:
- "Back to import setup" button calls `goToImportStep`
  - button: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L1747)
  - implementation clears error and forces step 2: [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L882)

So flow can still proceed to Import/Review after clearing `errorState` via that button.

## 7) Why Create Connection becomes disabled afterwards

Create button disabled logic is in `footerPrimaryDisabled`:
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L1791)

The key disable condition at Review step is:
- `(stepIndex === 3 && !draftConnectionId)`
  - [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L1796)

This allows entering Review from Import (step 2 -> 3) without verifying draft connection id:
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L796)

Therefore, if `draftConnectionId` is missing, user can still reach Review but "Create Connection" stays disabled by footer gating.
