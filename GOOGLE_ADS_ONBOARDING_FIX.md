# GOOGLE_ADS_ONBOARDING_FIX

## Current architecture

Before this fix, the Google Ads onboarding/runtime path had two structural issues:

1. Identity conflation:
- `google_oauth_connections.provider_account_id` was treated as both:
  - OAuth user identity (Google subject), and
  - Google Ads customer identity.

2. Incomplete Google Ads request auth:
- Google Ads runtime was configured to use `developer-token` header, but runtime traces proved it was effectively missing during requests.

3. Frontend account selection source:
- Frontend account selector used static/mock connector account options instead of real Google Ads accessible customer accounts returned by Google Ads API.

4. Sync customer targeting:
- Sync could execute with incorrect customer targeting context if the selected customer did not come from a validated accessible-customer list for that OAuth connection.

## Correct Google Ads authentication architecture

The corrected architecture separates identity and customer targeting explicitly.

1. OAuth identity layer (Google user)
- OAuth callback persists Google user identity only in `google_oauth_connections.provider_account_id`.
- This field now remains the OAuth account identifier (subject) and is no longer used as sync customer id.

2. Google Ads accessible-customer discovery
- Immediately after OAuth token exchange succeeds, backend calls Google Ads `customers:listAccessibleCustomers` using:
  - OAuth access token
  - required `developer-token` header
- Returned customer IDs are persisted as a separate dataset tied to the OAuth connection.

3. Google Ads customer selection model
- Accessible customer IDs are stored in a dedicated table and one account is marked selected.
- Sync accepts a selected Google Ads customer ID and validates it exists among active accessible accounts for the connection.

4. Google Ads API auth completeness
- Every Google Ads request is sent with:
  - `Authorization: Bearer <access token>`
  - `developer-token: <configured token>`
- Missing developer token is now treated as configuration error.

## Database changes

Added migration:
- `identity-platform/migrations/005_google_ads_account_onboarding.sql`

New table:
- `google_ads_customer_accounts`
  - `id uuid primary key`
  - `connection_id uuid not null references google_oauth_connections(id) on delete cascade`
  - `customer_id text not null`
  - `display_name text`
  - `currency_code text`
  - `time_zone text`
  - `status varchar(32) not null default 'active'` (`active|inactive`)
  - `is_selected boolean not null default false`
  - `discovered_at timestamptz not null default now()`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - unique `(connection_id, customer_id)`

Migration runner update:
- `src/identity-platform/infrastructure/postgres/migration-runner.ts` now runs:
  - `001_identity_core.sql`
  - `002_identity_production_foundation.sql`
  - `003_google_oauth_connections.sql`
  - `004_google_ads_integration_layer.sql`
  - `005_google_ads_account_onboarding.sql`

## Backend changes

### OAuth callback onboarding
- File: `src/identity-platform/google-oauth/service.ts`
- On successful callback:
  - exchange code
  - fetch userinfo
  - call Google Ads `customers:listAccessibleCustomers`
  - persist OAuth connection with `providerAccountId = profile.id` only
  - upsert accessible customer accounts into `google_ads_customer_accounts`

### Accessible-account repository support
- File: `src/identity-platform/google-oauth/repository.ts`
- Added methods:
  - `replaceAccessibleCustomerAccounts(...)`
  - `listAccessibleCustomerAccounts(connectionId)`
  - `findAccessibleCustomerAccount(connectionId, customerId)`

### Google Ads provider API endpoint for accounts
- Files:
  - `src/identity-platform/integrations/provider-registry.ts`
  - `src/identity-platform/integrations/google-ads/provider.ts`
  - `src/identity-platform/schemas.ts`
  - `src/identity-platform/interfaces/rest/server.ts`
- Added integration action support:
  - `GET /v1/integrations/google-ads/accounts?connectionId=<uuid>`
  - Returns persisted accessible customer accounts for the connection.

### Sync targeting enforcement
- File: `src/identity-platform/google-ads/sync-service.ts`
- Sync now uses `input.customerId` as the source customer id.
- Added validation: provided customer must exist in active accessible accounts for the connection, otherwise fail with `GOOGLE_ADS_INVALID_CUSTOMER`.

### Developer token handling
- Files:
  - `src/identity-platform/dependency-injection/container.ts`
  - `src/identity-platform/google-ads/client.ts`
  - `src/identity-platform/google-oauth/service.ts`
- Developer token is read from env and required.
- Google Ads client now throws `GOOGLE_ADS_CONFIGURATION_ERROR` when token is missing.
- OAuth discovery call also requires developer token and sends it as `developer-token`.

## Frontend changes

### Use backend-discovered accessible Google Ads accounts
- File: `src/infrastructure/data/repositories/integration.repository.ts`
- In callback validation flow:
  - fetches `GET /v1/integrations/google-ads/accounts`
  - stores accounts in connection metadata (`availableGoogleAdsCustomerAccounts`)
  - sets `metadata.customerId` to selected/first accessible customer id
  - keeps account label aligned with selected accessible account

### Bootstrap callback validation
- File: `src/features/integrations/hooks/use-connections-center.ts`
- On callback (`google_oauth=connected`), explicitly validates connection so local runtime state is materialized as connected with selected accessible account context.

### Wizard account selector wiring
- File: `src/features/integrations/components/new-connection-wizard.tsx`
- For Google Ads:
  - account options are derived from `availableGoogleAdsCustomerAccounts` (dynamic backend payload)
  - no longer relies on pre-OAuth static customer IDs for sync targeting
  - callback handling transitions to account fetch stage and import step with discovered accounts

## Environment variables required

Required for Google Ads onboarding + runtime:

1. OAuth (already required)
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_ID`
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_CLIENT_SECRET`
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_REDIRECT_URI`
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_SUCCESS_REDIRECT_URI`
- `IDENTITY_PLATFORM_GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY` (or fallback token hash secret)

2. Google Ads API
- `IDENTITY_PLATFORM_GOOGLE_ADS_API_BASE_URL` (default: `https://googleads.googleapis.com/v17`)
- `IDENTITY_PLATFORM_GOOGLE_ADS_DEVELOPER_TOKEN` (required)
  - fallback supported: `GOOGLE_ADS_DEVELOPER_TOKEN`
- Optional:
  - `IDENTITY_PLATFORM_GOOGLE_ADS_LOGIN_CUSTOMER_ID`
  - `IDENTITY_PLATFORM_GOOGLE_ADS_MAX_RETRIES`
  - `IDENTITY_PLATFORM_GOOGLE_ADS_RATE_LIMIT_MS`

## End-to-end request flow

1. Start OAuth
- Frontend: `POST /v1/integrations/google/oauth/start`
- Backend creates pending OAuth state + pending connection.

2. OAuth callback
- Google redirects to backend callback endpoint.
- Backend:
  - exchanges code for tokens
  - fetches Google user profile
  - calls `GET {googleAdsApiBaseUrl}/customers:listAccessibleCustomers` with:
    - bearer access token
    - `developer-token` header
  - stores OAuth user id in `google_oauth_connections.provider_account_id`
  - stores accessible customer IDs in `google_ads_customer_accounts`
  - marks one accessible customer selected
  - redirects frontend with callback status params

3. Frontend callback materialization
- Frontend validates callback connection state.
- Frontend fetches `GET /v1/integrations/google-ads/accounts?connectionId=<id>`.
- Selector displays accessible Google Ads customer accounts.
- Selected customer id is persisted in connection metadata used by runtime sync request payload.

4. Run Sync
- Frontend calls `POST /v1/integrations/google-ads/sync` with selected `customerId`.
- Backend verifies the provided customer id belongs to active accessible accounts for that connection.
- Google Ads client executes all API calls with required `developer-token` header.

5. Data integrity guarantees
- OAuth user identity and Ads customer identities are decoupled.
- Sync can only target accessible customer IDs discovered for that connection.
- Developer token is enforced as required configuration.
