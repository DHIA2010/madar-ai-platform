# MADAR Stage Readiness Report

## 1. Executive Summary

MADAR is structurally strong, but it is not yet ready to connect to real stage APIs without additional hardening. The repository builds successfully and the Vitest suite passes, which means the codebase is healthy from a delivery standpoint. The main stage blockers are environmental and data-source related: the app still falls back to mock repositories when `API_BASE_URL` is empty, `.env.example` is missing, authentication and workspace state are mock-backed by default, AI intelligence is entirely mock-backed, and one key product connector (`Shopify`) is referenced in the UI but not implemented in the integration layer.

The architecture is good enough for a staged rollout, but the current runtime behavior is still closer to a demo environment than a production-like beta. Before connecting real APIs, MADAR needs fail-fast environment validation, real stage credentials, a clear authentication refresh strategy, backend-backed repositories for core business domains, and a complete connector strategy.

## 2. Overall Stage Readiness Score

**Score: 57 / 100**

| Area                       | Score | Notes                                                                                                                |
| -------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------- |
| Architecture               |    82 | Clean separation between application, infrastructure, and feature layers. Strong repository and connector structure. |
| Environment                |    38 | Centralized env parsing exists, but `API_BASE_URL` still falls back to mock mode and `.env.example` is missing.      |
| Authentication             |    46 | Login/logout/session flow exists, but session refresh and stage-grade auth enforcement are not complete.             |
| API Readiness              |    55 | Interfaces and adapters exist, but several repositories are still in-memory or mock-backed.                          |
| Connectors                 |    72 | Meta, Google Ads, GA4, TikTok, Snapchat, Salla, and Zid are present; Shopify is missing.                             |
| Dashboard / KPI Validation |    48 | KPI shapes are defined, but most production KPI values still come from mock or in-memory sources.                    |
| Testing                    |    91 | Vitest suite passes; build and typecheck also pass.                                                                  |
| Deployment Readiness       |    68 | Static export build succeeds, but runtime configuration and environment hardening still need work.                   |

**Go / No-Go:** **No-go for real stage data** until environment fail-fast, auth/session hardening, and backend connectivity are addressed.

## 3. Architecture Assessment

### What is already strong

- The application is layered cleanly into application, infrastructure, and feature domains.
- Repository interfaces are defined in contracts, and the infrastructure layer provides concrete implementations.
- Route governance is centralized through `src/constants/routes.ts`.
- The build pipeline, linting, type checking, and tests are already wired into the project scripts.
- Connector implementations use a common contract shape with explicit lifecycle steps, capabilities, health, and token refresh support.

### What blocks stage confidence

- The public infrastructure barrel still exports the mock layer, which makes demo behavior easy to reach from the same public surface.
- Several repositories silently switch to mock behavior when `API_BASE_URL` is empty.
- Some routes are still explicit placeholders, which is fine for internal design work but not for a first private beta.
- The app is statically exported, so any stage deployment must be paired with a correctly configured external API endpoint and host-level environment injection.

### Architecture verdict

The architecture is **good enough to stage** once the runtime sources are switched from mock-first to environment-validated production behavior.

## 4. Mock Data Inventory

| Area                        | Current Source                                                                                                                                                                        | Can Replace Now?                   | What It Needs                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Authentication              | `src/infrastructure/mock/mock-authentication.gateway.ts`, used as fallback in `src/infrastructure/data/repositories/authentication.repository.ts`                                     | No                                 | Real auth backend, token refresh, session invalidation, identity claims.                                       |
| Workspace                   | `src/infrastructure/workspace/mock-workspace-data.ts`, used in `src/infrastructure/data/repositories/workspace.repository.ts` and `src/infrastructure/mock/mock-workspace.gateway.ts` | No                                 | Real org/workspace API, tenant selection, persistence.                                                         |
| Dashboard package / widgets | `src/infrastructure/dashboard/mock-dashboard-data.ts` and `src/infrastructure/mock/mock-dashboard.gateway.ts`                                                                         | No                                 | Real dashboard package endpoint, widget read models, tenant-scoped filters.                                    |
| AI Intelligence             | `src/infrastructure/ai/mock-ai-intelligence-data.ts` and `src/infrastructure/data/repositories/ai-intelligence.repository.ts`                                                         | No                                 | AI pipeline, stage model endpoint, historical aggregation, anomaly scoring.                                    |
| Campaigns                   | `src/infrastructure/campaigns/mock-campaign-data.ts` seeded into `src/infrastructure/data/repositories/campaign.repository.ts`                                                        | Partially                          | Backend API for list/details CRUD, plus paging/filtering backed by real data.                                  |
| Customer intelligence       | `src/infrastructure/data/repositories/customer-intelligence.repository.ts`                                                                                                            | No                                 | Event ingestion, journey history, sessioning, and customer timelines from real tracking data.                  |
| Segmentation                | `src/infrastructure/data/repositories/segmentation.repository.ts`                                                                                                                     | No                                 | Segment CRUD, preview/evaluate endpoints, and customer-history-backed membership calculations.                 |
| Attribution                 | `src/infrastructure/data/repositories/attribution.repository.ts`                                                                                                                      | No                                 | Journey touchpoints, conversion events, campaign spend feed, and attribution model computation from real data. |
| Integrations                | `src/infrastructure/data/repositories/integration.repository.ts`                                                                                                                      | No                                 | Real connector lifecycle endpoints, webhook handling, sync orchestration, and status/history persistence.      |
| Permissions                 | `src/infrastructure/mock/mock-permission.gateway.ts`                                                                                                                                  | No                                 | Real permission claims from auth or tenant policy service.                                                     |
| Feature flags               | `src/infrastructure/mock/mock-feature-flag.gateway.ts`                                                                                                                                | No                                 | Remote config or stage flag service.                                                                           |
| Notifications               | `src/infrastructure/mock/mock-notification.gateway.ts`                                                                                                                                | No                                 | Notification service or event bus integration.                                                                 |
| Placeholder pages           | `src/app/(layout-pages)/channels/page.tsx`, `src/app/(layout-pages)/settings/page.tsx`, campaign templates UI                                                                         | Yes, if stage users can reach them | Real feature content or route gating.                                                                          |

### Mock inventory verdict

MADAR still behaves like a curated demo in multiple core paths. That is acceptable for internal review, but not for a first private beta connected to real APIs.

## 5. Environment Assessment

### Current environment model

- Environment parsing is centralized in `src/infrastructure/environment/app-environment.ts`.
- Supported variables include `APP_NAME`, `APP_URL`, `API_BASE_URL`, `REQUEST_TIMEOUT_MS`, and `ENABLE_DEBUG_LOGS`, with `NEXT_PUBLIC_*` variants for client access.
- The HTTP client resolves its base URL from the env layer and falls back to an empty string when nothing is set.
- The environment validation script expects a `.env.example` file, but none exists in the repository.

### Key issues

| Issue                                                    | Why it matters                                                                | Risk     | Recommended fix                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `API_BASE_URL` defaults to an empty string               | The app silently switches to mock repositories instead of failing fast.       | Critical | Make stage/production require a real API base URL and throw on missing config.        |
| No `.env.example`                                        | Onboarding and validation break; deployment prerequisites are undocumented.   | High     | Add a complete `.env.example` with required local/stage/prod variables.               |
| Hardcoded SEO / canonical URLs in the root layout        | Stage/prod metadata can point at the wrong host.                              | Medium   | Move metadata URLs to environment-driven configuration.                               |
| Only `APP_URL` and `APP_NAME` are enforced in production | Missing `API_BASE_URL` can still slip through.                                | Critical | Extend production validation to require the API base URL and any external secrets.    |
| Mock URLs inside infrastructure code                     | Stage traffic can still look “healthy” while hitting internal mock endpoints. | Medium   | Replace mock URLs with environment-driven endpoints or remove them from stage builds. |

### Environment verdict

MADAR has the right abstraction, but not the right enforcement. Environment handling must become fail-fast before stage connectivity is safe.

## 6. API Readiness

| Repository            | Current State                                                                                   | Stage Readiness | What Is Missing                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Authentication        | API adapter exists, but falls back to `MockAuthenticationGateway` when `API_BASE_URL` is empty. | Partial         | Real auth endpoints, refresh flow, expiry handling, and server-side identity claims. |
| Workspace             | API adapter exists, but uses mock organizations/workspaces without a base URL.                  | Partial         | Tenant/org/workspace endpoints and persistence.                                      |
| Dashboard             | API adapter exists, but returns mock dashboard packages and widget payloads in offline mode.    | Partial         | Dashboard package endpoint, widget read models, and tenant-aware filtering.          |
| AI Intelligence       | Always returns `mockAIIntelligenceDashboard`.                                                   | Not ready       | AI aggregation service or stage AI endpoint.                                         |
| Campaigns             | In-memory CRUD with pagination/filtering over seeded campaign data.                             | Partial         | Real campaign list/details/create/update endpoints and persistence.                  |
| Customer intelligence | In-memory tracking/journey/session state.                                                       | Not ready       | Event ingestion, customer history APIs, and persistent journey storage.              |
| Segmentation          | In-memory segment store built on customer intelligence state.                                   | Not ready       | Segment evaluation, preview, snapshot, and persistence endpoints.                    |
| Attribution           | Local sample touchpoints and conversions.                                                       | Not ready       | Attribution ingestion and real campaign spend / conversion data source.              |
| Integrations          | Strong contract surface, but repository is still orchestrating local state and mock URLs.       | Partial         | Stage backend for connections, status, sync, webhooks, and health.                   |
| Notifications         | No-op repository.                                                                               | Not ready       | Notification delivery or event-driven integration.                                   |

### API verdict

The interface layer is mostly ready, but several repositories are still local or mock-backed. Stage APIs are required for auth, workspace, AI, customer intelligence, segmentation, attribution, and integrations.

## 7. Connector Readiness Matrix

| Connector    | Status                                            | Required Auth                               | Expected Endpoints                                                         | Required Entities                                             | Dependencies                                                  |
| ------------ | ------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Meta Ads     | Ready in code, backend still needed for real data | OAuth 2.0 with refresh token                | Accounts, campaigns, ad sets, ads, insights, conversions, token refresh    | Ad account, campaign, ad set, ad, creative, insight, audience | Meta app, Business Manager, webhook and sync cadence if used. |
| Google Ads   | Ready in code, backend still needed for real data | OAuth 2.0 with refresh token                | Customers, campaigns, ad groups, ads, keywords, conversions, insights      | Customer account, campaign, ad group, keyword, conversion     | Google Cloud / Ads account, consent scope, refresh handling.  |
| GA4          | Ready in code, backend still needed for real data | OAuth 2.0 or service account style access   | Properties, reports, events, conversions, traffic acquisition              | Property, event, session, conversion, audience                | Google Analytics property access, reporting quotas.           |
| TikTok Ads   | Ready in code, backend still needed for real data | OAuth 2.0 with refresh token                | Advertiser accounts, campaigns, ad groups, ads, analytics, conversions     | Advertiser account, campaign, ad group, ad, pixel events      | TikTok developer app, approved scopes.                        |
| Snapchat Ads | Ready in code, backend still needed for real data | OAuth 2.0 with refresh token                | Ad accounts, campaigns, ad squads, ads, insights, conversions              | Ad account, campaign, squad, ad, pixel event                  | Snapchat marketing API credentials.                           |
| Salla        | Ready in code, backend still needed for real data | OAuth 2.0 plus webhook verification         | Products, orders, customers, inventory, sync, webhook events               | Store, product, order, customer, webhook                      | Salla app credentials, webhook secret, commerce sync.         |
| Zid          | Ready in code, backend still needed for real data | OAuth 2.0 plus webhook verification         | Products, orders, customers, inventory, sync, webhook events               | Store, product, order, customer, webhook                      | Zid app credentials, webhook secret, commerce sync.           |
| Shopify      | **Missing**                                       | OAuth app install plus webhook verification | Products, orders, customers, inventory, fulfillment, collections, webhooks | Shop, product, order, customer, inventory, fulfillment        | Shopify app, API scopes, webhook signature verification.      |

### Connector verdict

Seven connector families exist in the codebase, but Shopify is absent. For a stage beta, either ship Shopify or explicitly remove it from the product surface until it is implemented.

## 8. Dashboard KPI Validation Matrix

| KPI                               | Definition                                           | Current Source                                                 | API Required | Required Fields                                         | Can Calculate Today?                   | Needs Historical Data? | Needs AI?                         |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ------------ | ------------------------------------------------------- | -------------------------------------- | ---------------------- | --------------------------------- |
| Marketing Health Score            | Composite health indicator for the active workspace. | `src/infrastructure/ai/mock-ai-intelligence-data.ts`, AI page. | Yes          | Score, delta, label, anomaly counts, efficiency inputs. | Yes, from mock data.                   | Yes                    | Yes, for meaningful stage output. |
| Revenue                           | Attributed revenue across channels or campaigns.     | Dashboard, AI, campaign KPIs.                                  | Yes          | Revenue by channel/campaign/date.                       | Yes, from current mock/in-memory data. | Yes                    | No                                |
| Spend                             | Paid media spend.                                    | AI budget analysis, campaign data.                             | Yes          | Spend by channel/campaign/date.                         | Yes.                                   | Yes                    | No                                |
| ROAS                              | Revenue divided by spend.                            | AI, campaign KPIs, dashboard widgets.                          | Yes          | Revenue, spend.                                         | Yes.                                   | Yes                    | No                                |
| CPA / CAC                         | Cost per acquisition / customer acquisition cost.    | Campaign and AI/customer metrics.                              | Yes          | Spend, conversions, customers acquired.                 | Partially.                             | Yes                    | No                                |
| CTR                               | Click-through rate.                                  | Campaign and channel metrics.                                  | Yes          | Impressions, clicks.                                    | Partially.                             | Yes                    | No                                |
| Conversion rate                   | Conversion efficiency for campaigns / website.       | Campaigns, dashboard widgets, customer funnel.                 | Yes          | Sessions, conversions, purchases.                       | Partially.                             | Yes                    | No                                |
| Open alerts / anomalies           | Count of active risks requiring action.              | AI intelligence.                                               | Yes          | Severity, timestamps, issue state.                      | Yes, from mock.                        | Yes                    | Yes                               |
| Channel spend share               | Budget concentration by channel.                     | AI budget analysis.                                            | Yes          | Spend per channel.                                      | Yes.                                   | Yes                    | No                                |
| Product revenue / margin          | Commerce performance by product.                     | AI product insights, commerce modules.                         | Yes          | Revenue, units sold, margin, trend.                     | Partially.                             | Yes                    | No                                |
| Customer LTV / CAC / repeat rate  | Customer quality and retention efficiency.           | AI customer insights, customer intelligence.                   | Yes          | LTV, CAC, repeat rate, acquisition channel.             | Partially.                             | Yes                    | No                                |
| Visitors / sessions / bounce rate | Traffic quality and engagement.                      | Dashboard package widgets, customer intelligence.              | Yes          | Visitors, sessions, bounce rate, landing/exit pages.    | Partially.                             | Yes                    | No                                |
| Checkout funnel                   | Funnel from add-to-cart to purchase.                 | Customer intelligence.                                         | Yes          | Add to cart, begin checkout, purchase.                  | Partially.                             | Yes                    | No                                |
| Estimated upside                  | Suggested financial upside from reallocation.        | AI page.                                                       | Yes          | ROAS, spend, channel comparisons, business rules.       | No, only in mock calculations.         | Yes                    | Yes                               |

### Dashboard verdict

The KPI schema is rich, but most values still depend on mock or in-memory stores. The dashboard is ready for a stage data contract only after the underlying repositories are connected to real sources.

## 9. Production Risks

| Risk                                                  | Why it matters                                                    | Risk Level | Recommended Fix                                                                         | Estimated Effort |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- | ---------------- |
| Silent mock fallback when `API_BASE_URL` is empty     | Stage could appear healthy while showing mock or stale data.      | Critical   | Fail fast in stage/prod when API base URL is missing.                                   | S                |
| Missing `.env.example`                                | Deployment and onboarding are brittle.                            | High       | Add a complete environment template and keep it in sync with validation.                | S                |
| Session expiry has no silent refresh                  | Users can be logged out unexpectedly or remain on stale sessions. | High       | Add refresh-token rotation and proactive refresh before access token expiry.            | M                |
| Shopify is referenced but not implemented             | Stage users can hit a dead product surface or integration gap.    | High       | Implement Shopify connector or remove it from the stage surface.                        | L                |
| Feature flags and permissions are mock-only           | Access control is not yet stage-real.                             | High       | Back them with a tenant policy service or auth claims source.                           | M                |
| No runtime DTO validation at repository boundaries    | Real API drift could break dashboards silently.                   | Medium     | Add runtime schema validation for critical API payloads.                                | M                |
| No health/version endpoint                            | Monitoring and release verification are limited.                  | Medium     | Add a health endpoint and a version endpoint.                                           | S                |
| Build emits a `postcss.config.js` module-type warning | Not a blocker, but it adds noise and hints at config drift.       | Low        | Normalize package/module metadata.                                                      | S                |
| Few UI / E2E tests                                    | Build can pass while user flows still break in the browser.       | Medium     | Add Playwright or Cypress for auth, workspace, integrations, and dashboard smoke flows. | M-L              |

## 10. Recommended Sprint Plan

### Phase 1: Stage foundation

- Add `.env.example` and make environment validation strict for stage/prod.
- Require `API_BASE_URL` in non-local environments.
- Remove hardcoded production URLs from app metadata.
- Add health and version endpoints or equivalent host-level checks.

### Phase 2: Authentication and session readiness

- Replace mock auth fallback with real stage auth behavior.
- Add refresh-token rotation and proactive refresh.
- Verify logout invalidates the session cleanly.
- Replace mock permission checks with backend claims or policy lookup.

### Phase 3: Core data wiring

- Connect workspace, dashboard, campaign, customer intelligence, attribution, and segmentation repositories to stage APIs.
- Add runtime DTO validation at the repository boundary.
- Ensure pagination, filtering, and sort parameters are preserved through API mapping.

### Phase 4: Connector readiness

- Validate Meta Ads, Google Ads, GA4, TikTok, Snapchat, Salla, and Zid against real stage credentials.
- Implement Shopify or remove it from the product surface until it exists.
- Add webhook signature verification and connector health checks.

### Phase 5: Observability and quality hardening

- Add tracing/correlation headers to requests and logs.
- Add E2E coverage for login, workspace selection, dashboard load, and connector creation.
- Add failure telemetry for repository and API errors.

## 11. Immediate Next Actions

1. Create `.env.example` and make stage/prod fail fast when `API_BASE_URL` is missing.
2. Replace the mock-first authentication and workspace defaults with real stage API behavior.
3. Decide the Shopify path immediately: implement the connector or remove the reference from the stage surface.
4. Add runtime validation for critical API payloads and connector responses.
5. Add a small stage smoke test for login, workspace restore, dashboard load, and integrations load.

## 12. Sprint 1 Stage Foundation Implementation Update

### Implemented in this sprint

- Added explicit runtime mode support in environment parsing: `development`, `stage`, `production`, `mock`.
- Added environment validation state with fail-fast checks for stage/production requirements.
- Enforced `API_BASE_URL` for stage/production runtime modes.
- Enforced `ENABLE_MOCK_REPOSITORIES=false` for stage/production runtime modes.
- Removed silent repository fallback in authentication, workspace, and dashboard repositories by centralizing backend resolution.
- Added explicit repository configuration errors (`ConfigurationError`) for invalid runtime or missing required configuration.
- Added explicit mock-only repository guard in AI intelligence repository.
- Added runtime configuration error surfacing in authentication and workspace providers to avoid generic silent error states.
- Replaced legacy `.env.example` with runtime-aware variables and added `.env.local`, `.env.stage`, `.env.production` templates.
- Updated `.gitignore` to keep `.env.example`, `.env.stage`, and `.env.production` tracked while preserving local secret file ignores.

### Remaining blockers after Sprint 1

- Campaign, customer intelligence, segmentation, attribution, integration, and notification repositories remain in-memory or mock-based and still need stage API wiring.
- Auth refresh-token rotation and stage-grade permission/feature-flag backends are still pending.
- Shopify connector implementation/status decision is still pending.

## Validation Status

- `npm run build:ci` passed.
- `npm test` passed (`43` files, `142` tests).
- The repository still emits a non-blocking `postcss.config.js` module-type warning during Node execution.
