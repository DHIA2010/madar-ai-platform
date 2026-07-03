# Stage Integration Plan

## Objective

Run MADAR on Stage against real backend services with production-like data, without architecture redesign.

## Scope Guardrails

- Stop Sprint 2 auth hardening work unless it blocks Stage connectivity.
- Do not add pages.
- Do not redesign UI or UX.
- Do not change dashboard business logic.
- Keep current application, infrastructure, and repository boundaries.
- Keep mock behavior available only through explicit runtime mode `mock`.

## Current Repository Data Source Inventory

### Hybrid (API + mock fallback through runtime backend selection)

- Authentication repository: API adapter exists, mock gateway fallback still present for runtime mode `mock`.
- Workspace repository: API adapter exists, mock organizations/workspaces fallback still present for runtime mode `mock`.
- Dashboard repository: API adapter exists, mock package/widgets fallback still present for runtime mode `mock`.

### Mock-only or in-memory (not Stage-ready)

- Campaign repository: in-memory seeded dataset.
- Integration repository: in-memory lifecycle/state store.
- Customer intelligence repository: in-memory sessions/events/journeys.
- Segmentation repository: in-memory store layered on customer intelligence in-memory state.
- Attribution repository: static local touchpoints/conversions.
- AI Intelligence repository: explicit mock-only guard with mock dashboard payload.
- Notification repository: no-op implementation.
- Reports feature: static in-component constants, no backend data path.

## Dependency Map (API Rollout Order)

1. Authentication
- Required first because all downstream modules rely on valid session context.
- Endpoint base: `NEXT_PUBLIC_AUTH_API_BASE_URL` (fallback to `NEXT_PUBLIC_API_BASE_URL`).
- Required endpoints already mapped in adapters:
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/me`
  - `POST /auth/refresh`
  - `POST /auth/forgot-password`
  - `POST /auth/reset-password`
  - `POST /auth/verify-email`

2. Workspace
- Depends on authenticated context and workspace scoping headers.
- Required endpoints already mapped in adapters:
  - `GET /workspaces/organizations`
  - `GET /workspaces?organizationId=...`
  - `GET /workspaces/current?organizationId=...&workspaceId=...`
  - `POST /workspaces/switch`

3. Dashboard KPIs
- Depends on authentication and workspace selection.
- Required endpoints already mapped in adapters:
  - `GET /dashboard/package` with role/permissions/feature-flag filters
  - `GET /dashboard/widgets/:widgetId`

4. Campaigns
- Depends on authentication + workspace + dashboard KPI consistency.
- Required first backend contract:
  - `GET /campaigns` with pagination/filter/sort
  - `GET /campaigns/:campaignId`
  - `POST /campaigns`
  - `PATCH /campaigns/:campaignId` (or `PUT` if backend standardizes)

5. Integrations
- Depends on authentication + workspace tenancy.
- Required first backend contract (minimum Stage vertical slice):
  - Connector definitions list
  - Connections list/create/disconnect
  - Integration status
  - Sync history
  - Health checks
- Keep existing connector domain classes; replace in-memory repository orchestration with HTTP-backed calls.

6. Customers (Customer Intelligence)
- Depends on authentication + workspace + campaign signals.
- Required first backend contract:
  - Start/end session
  - Track event
  - Journey lookup
  - Visitor history
  - Traffic sources
  - Campaign attribution aggregates
  - Product interest
  - Widget metrics

7. AI Intelligence
- Depends on dashboard + campaigns + customers availability.
- Required first backend contract:
  - `GET /ai/intelligence/dashboard` (workspace scoped)
  - Payload parity with current view model fields for insights, anomalies, channel metrics, customer metrics, product insights.

8. Reports
- Depends on upstream domain data readiness (dashboard/campaign/customers/AI).
- Current reports page uses static constants; Stage integration options without redesign:
  - Preferred: backend-driven reports summary endpoint consumed by existing reports feature component.
  - Alternative: derive report cards from already integrated dashboard/campaign/customer APIs while preserving current UI structure.

## Module-by-Module Execution Plan

### Module 1: Authentication

- Confirm Stage env vars are set in deployment:
  - `NEXT_PUBLIC_APP_RUNTIME_MODE=stage`
  - `NEXT_PUBLIC_ENABLE_MOCK_REPOSITORIES=false`
  - `NEXT_PUBLIC_AUTH_API_BASE_URL` set
- Validate auth endpoints and typed error mapping behavior with real backend responses.
- Exit criteria:
  - Login/logout/me/refresh use real API successfully on Stage.
  - No implicit switch to mock in Stage mode.

Validation and commit gate:
- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- Commit

### Module 2: Workspace

- Keep repository shape; swap runtime behavior to API path in Stage.
- Validate workspace header propagation and selection consistency.
- Exit criteria:
  - Organizations/workspaces/current/switch resolved from backend.

Validation and commit gate:
- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- Commit

### Module 3: Dashboard KPIs

- Keep existing dashboard repository contract and read-model behavior.
- Validate package resolution and widget read model parity against current UI usage.
- Exit criteria:
  - KPI cards and dashboard widget reads are backend sourced in Stage.

Validation and commit gate:
- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- Commit

### Module 4: Campaigns

- Replace in-memory campaign repository implementation with API-backed calls.
- Preserve existing query/filter/sort semantics exposed by contracts.
- Exit criteria:
  - Campaign list/details/create/update all backend sourced.

Validation and commit gate:
- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- Commit

### Module 5: Integrations

- Replace in-memory state store with backend orchestration endpoints.
- Keep connector contract and existing integration domain behavior.
- Exit criteria:
  - Connection lifecycle/status/history/health resolved from backend.

Validation and commit gate:
- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- Commit

### Module 6: Customers

- Replace in-memory journey/session/event stores with backend APIs.
- Keep existing contract fields and mapper expectations.
- Exit criteria:
  - Customer intelligence screens and widget metrics read backend data.

Validation and commit gate:
- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- Commit

### Module 7: AI Intelligence

- Replace mock-only dashboard payload with API adapter/repository path.
- Keep existing AI UI model shape to avoid UX changes.
- Exit criteria:
  - AI overview data is backend sourced on Stage.

Validation and commit gate:
- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- Commit

### Module 8: Reports

- Replace static report constants with backend-fed payload (or derived existing backend data) without changing page UX.
- Exit criteria:
  - Reports page content is generated from real backend data on Stage.

Validation and commit gate:
- `npm run lint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- Commit

## Stage Validation Checklist Per Module

- Runtime mode is `stage`.
- Mock repositories disabled in env.
- Target module repository path resolves to API backend in Stage.
- Typed errors are surfaced (no silent fallback).
- Lint, typecheck, tests, and build all pass before next module starts.

## Blocker Policy

Only resume additional authentication hardening (beyond connectivity) if a specific blocker prevents Stage from operating with real backend data.
