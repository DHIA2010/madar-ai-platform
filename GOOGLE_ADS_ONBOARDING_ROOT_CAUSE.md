# GOOGLE_ADS_ONBOARDING_ROOT_CAUSE

Scope
- Investigated only onboarding flow: OAuth callback -> token persistence -> accessible account discovery/persistence -> frontend redirect/account selection.
- Did not investigate Run Sync.

## Execution Trace (Current)
1. Backend callback entry:
   - `GoogleOAuthController.callback(...)` in `src/identity-platform/google-oauth/controller.ts`.
   - On success it calls `GoogleOAuthService.completeAuthorization(...)` then redirects via `GoogleOAuthService.buildSuccessRedirect(...)`.

2. Token persistence:
   - `GoogleOAuthService.completeAuthorization(...)` calls `repository.upsertConnection(...)`.
   - OAuth identity is persisted into `google_oauth_connections.provider_account_id`.

3. Accessible account discovery:
   - Should happen inside `GoogleOAuthService.completeAuthorization(...)` via `fetchAccessibleGoogleAdsCustomerIds(...)`.
   - This is the function that calls Google endpoint `customers:listAccessibleCustomers`.

4. Accessible account persistence:
   - Should happen via `repository.replaceAccessibleCustomerAccounts(...)`.

5. Frontend onboarding resume:
   - Intended page: `/integrations/new` (New Connection Wizard).
   - Wizard callback handling is in `NewConnectionWizard` (`src/features/integrations/components/new-connection-wizard.tsx`).

## Root Cause
There were two early-exit points in onboarding:

1. Redirect landing mismatch
- Success redirect could land on `/integrations` (Connections Overview), where no account-selection onboarding step is rendered.
- If callback lands there, user sees onboarding as effectively finished.

2. Wizard callback gate skipped processing
- In `NewConnectionWizard`, callback processing was gated by:
  - `if (selectedConnector?.connectorId !== "google_ads") return`
- Initial selected connector is Salla (step starts at Platform), so callback processing could be skipped before selecting Google Ads context.
- Result: account-selection state was not initialized from callback metadata.

## Answers Requested
1. Which function performs the redirect?
- `GoogleOAuthController.callback(...)` returns redirect response using `GoogleOAuthService.buildSuccessRedirect(...)`.

2. Which function should call `listAccessibleCustomers()`?
- `GoogleOAuthService.completeAuthorization(...)` (via helper `fetchAccessibleGoogleAdsCustomerIds(...)`).

3. Whether `listAccessibleCustomers()` is actually executed?
- In code path: yes, it is part of `completeAuthorization(...)`.
- In active runtime evidence for existing connection: no persisted accessible accounts table data was available; onboarding behavior indicated callback path reached redirect without account-selection resume.

4. Whether accessible accounts are stored?
- They should be stored by `GoogleOAuthRepository.replaceAccessibleCustomerAccounts(...)`.
- Runtime DB evidence during investigation: table `google_ads_customer_accounts` was absent in current DB, so persisted accessible account rows were not available.

5. Why the account selection page never opens?
- Callback could land on `/integrations` (overview), not onboarding route.
- Even on `/integrations/new`, callback handling could be skipped due connector gate (default connector != Google Ads).

6. Which frontend route should display account selection?
- `/integrations/new`.

7. Whether that route exists?
- Yes: `src/app/(layout-pages)/integrations/new/page.tsx`.

8. If it exists, why is it skipped?
- Redirect can land on `/integrations` instead.
- Wizard callback processing was conditionally skipped before setting Google Ads connector context.

## Fix Applied (Onboarding Only)
1. Backend redirect hardening
- File: `src/identity-platform/google-oauth/service.ts`
- Change: `buildSuccessRedirect(...)` now normalizes `/integrations` to `/integrations/new` for onboarding success redirects.

2. Frontend fallback redirect
- File: `src/features/integrations/components/connections-overview.tsx`
- Change: if callback params are detected on `/integrations` (`google_oauth=connected` + `google_connection_id`), immediately `router.replace(...)` to `/integrations/new` with same query.

3. Wizard callback processing fix
- File: `src/features/integrations/components/new-connection-wizard.tsx`
- Change: removed early gate requiring preselected Google Ads connector before processing callback.
- Change: after callback validation, sets connector context from validated connection (`connectorDefinitionId`) and resumes onboarding to import/account-selection stage.

## Result
- OAuth callback now consistently resumes onboarding on `/integrations/new`.
- Account-selection flow is no longer skipped due default connector state.
- Onboarding no longer exits early into Connections Overview.
