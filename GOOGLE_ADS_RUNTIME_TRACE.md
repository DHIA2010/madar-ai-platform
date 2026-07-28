# GOOGLE ADS RUNTIME TRACE

Date: 2026-06-28
Mode: Read-only analysis (no code changes)

## Executive Finding

Connections Center is not using the identity-platform Google OAuth + Google Ads sync pipeline.
It is wired to a frontend in-memory integration repository and Google Ads fixture gateway.
The runtime switches from real-data architecture to mock/fixture data at frontend dependency wiring.

Primary break point:
- src/infrastructure/provider.tsx:64 creates integrationRepository from createIntegrationRepository().
- src/application/context/application-context.tsx:62 and src/application/context/application-context.tsx:63 inject that repository into IntegrationApplicationService and ConnectionManager.
- src/infrastructure/data/repositories/integration.repository.ts:1173 always returns new DataIntegrationRepository() (in-memory implementation).

## End-to-End Trace (Requested Layers)

### 1) Frontend

Observed runtime path:
- src/app/(layout-pages)/integrations/page.tsx:1 renders ConnectionsOverview.
- src/features/integrations/components/connections-overview.tsx:936 reads syncActivity from local constant map.
- src/features/integrations/components/connections-overview.tsx:135 defines static SYNC_ACTIVITY; Google Ads fixture rows at lines 156-165.
- src/features/integrations/hooks/use-connections-center.ts:122 bootstrap creates and connects connectors locally.
- src/features/integrations/hooks/use-connections-center.ts:156 creates connection.
- src/features/integrations/hooks/use-connections-center.ts:169 uses synthetic authorizationCode value.
- src/features/integrations/hooks/use-connections-center.ts:171 connects via ConnectionManager.
- src/features/integrations/hooks/use-connections-center.ts:173 schedules sync.
- src/features/integrations/hooks/use-connections-center.ts:180 runs sync.
- src/features/integrations/components/new-connection-wizard.tsx:538 beginOAuthFlow is local flow.
- src/features/integrations/components/new-connection-wizard.tsx:599 uses synthetic authorizationCode value.
- src/features/integrations/components/new-connection-wizard.tsx:650 schedules sync locally.
- src/features/integrations/components/new-connection-wizard.tsx:795 runs sync locally.

Data type at this layer:
- Mock data + fake fixtures + static JSON + local state/localStorage.

### 2) REST API

Expected real endpoints exist:
- src/identity-platform/interfaces/rest/server.ts:226 (/v1/integrations/google/oauth/start)
- src/identity-platform/interfaces/rest/server.ts:186 (/v1/integrations/google/oauth/callback)
- src/identity-platform/interfaces/rest/server.ts:235 (/v1/integrations/{provider}/sync|records)

But Connections Center frontend does not call these endpoints:
- No integrations feature match for /v1/integrations or oauth start/callback in src/features/integrations/**.

Data type at this layer for actual UI runtime:
- Not reached.

### 3) Controller

Expected controller path (if REST used):
- src/identity-platform/google-oauth/controller.ts:24 start
- src/identity-platform/google-oauth/controller.ts:28 callback

Data type at this layer for actual UI runtime:
- Not reached.

### 4) Service

Expected backend services (if REST used):
- src/identity-platform/google-oauth/service.ts:220 startAuthorization
- src/identity-platform/google-oauth/service.ts:300 completeAuthorization
- src/identity-platform/google-ads/sync-service.ts:170 sync

Data type at this layer for actual UI runtime:
- Not reached.

### 5) Repository

Actual repository used by UI:
- src/infrastructure/data/repositories/integration.repository.ts:111 uses in-memory Map storage.
- src/infrastructure/data/repositories/integration.repository.ts:117 uses in-memory sync runs Map.
- src/infrastructure/data/repositories/integration.repository.ts:255 uses mock webhook endpoint.
- src/infrastructure/data/repositories/integration.repository.ts:1173 returns in-memory DataIntegrationRepository.

Backend repository that would persist real records if called:
- src/identity-platform/google-ads/repository.ts:456 reads from google_ads_domain_records table.

Data type at this layer:
- Actual UI runtime: Mock/in-memory repository state.
- Backend intended path: Persisted database data (not reached by Connections Center).

### 6) Google Ads Client

Backend real client exists:
- src/identity-platform/google-ads/client.ts issues HTTP requests to Google Ads API.

Actual UI runtime uses frontend fixture gateway instead:
- src/infrastructure/integration/google-ads/google-ads.gateway.ts:18 exchanges code by generating token strings.
- src/infrastructure/integration/google-ads/google-ads.gateway.ts:52 fetchAccounts returns hard-coded fixture rows.
- src/infrastructure/integration/google-ads/google-ads.gateway.ts:78 fetchCampaigns returns hard-coded fixture rows.

Data type at this layer:
- Actual UI runtime: Fake fixtures.
- Backend intended path: Real Google Ads data client (not reached).

### 7) Google Ads API

Backend intended destination:
- Google Ads API is reachable only via src/identity-platform/google-ads/client.ts when provider sync endpoint is invoked.

Actual UI runtime:
- Not reached.

Data type at this layer:
- None for current Connections Center execution path.

## Direct Answers

1. After OAuth succeeds, is a real Google Ads sync executed?
- No. A simulated sync is executed via frontend ConnectionManager + DataIntegrationRepository, not the identity-platform Google Ads sync service.
- Evidence: src/features/integrations/hooks/use-connections-center.ts:180 and src/features/integrations/components/new-connection-wizard.tsx:795 call local runSync.

2. Does the sync persist real Google Ads records?
- No for Connections Center runtime.
- It updates in-memory maps in DataIntegrationRepository and emits in-memory events.
- Evidence: src/infrastructure/data/repositories/integration.repository.ts:111, src/infrastructure/data/repositories/integration.repository.ts:117.

3. Which endpoint does the UI call?
- For Connections Center integration flow: no identity integration REST endpoint is called.
- It calls in-process service methods over injected repository objects.

4. Does that endpoint return database records or mock objects?
- Not applicable for Connections Center flow because no integration REST endpoint is called.
- Effective returned data is mock/in-memory objects from DataIntegrationRepository and fixture gateway.

5. Is the UI still wired to mock repositories?
- Yes (for integrations).
- Evidence: src/infrastructure/provider.tsx:64, src/application/context/application-context.tsx:62-63, src/infrastructure/data/repositories/integration.repository.ts:1173.

6. What is the first component that breaks the real-data pipeline?
- src/infrastructure/provider.tsx:64
- This is where the integrations feature is bound to createIntegrationRepository() (in-memory DataIntegrationRepository) instead of an API-backed identity integration adapter.

## Precise Switch Point (Real -> Mock)

Real-data architecture is bypassed before REST, at frontend dependency injection:
- src/infrastructure/provider.tsx:64
- src/application/context/application-context.tsx:62-63

From that point onward, OAuth, sync, history, and Google Ads account/campaign data are produced by local mock/fixture implementations:
- src/infrastructure/data/repositories/integration.repository.ts
- src/infrastructure/integration/google-ads/google-ads.gateway.ts
- src/features/integrations/components/connections-overview.tsx:135
