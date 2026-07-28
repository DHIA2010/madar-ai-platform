# FRONTEND RUNTIME WIRING

Date: 2026-06-28
Scope: Frontend-only production wiring for Connections Center runtime path

## Summary

The Connections Center production runtime path has been rewired from the in-memory integration repository to a REST-backed integration repository.

Backend, OAuth server logic, Google Ads backend integration logic, and architecture were not modified.

## Files Changed

- src/infrastructure/data/repositories/integration.repository.ts
- src/infrastructure/provider.tsx
- src/features/integrations/hooks/use-connections-center.ts
- src/features/integrations/components/new-connection-wizard.tsx
- src/features/integrations/components/connections-overview.tsx
- src/features/integrations/types/connections-center.types.ts

## Mock Runtime Paths Removed

- Removed in-memory integration runtime implementation from production path by replacing repository implementation with REST-backed repository in:
  - src/infrastructure/data/repositories/integration.repository.ts
- Removed fixture-based auto-creation of connector cards/connections in:
  - src/features/integrations/hooks/use-connections-center.ts
- Removed static sync activity fixture JSON from card rendering in:
  - src/features/integrations/components/connections-overview.tsx
- Removed mock reconnect authorization code path in:
  - src/features/integrations/hooks/use-connections-center.ts
- Removed mock OAuth code path in new connection wizard in:
  - src/features/integrations/components/new-connection-wizard.tsx

## REST Repository Added

A REST-backed integration repository now powers the runtime path:

- Class: RestIntegrationRepository
- Location: src/infrastructure/data/repositories/integration.repository.ts
- Injection point: src/infrastructure/provider.tsx (provider breakpoint formerly using in-memory implementation)

The repository now uses authenticated HTTP requests through createHttpDataClient and session/workspace context.

## Backend Endpoints Consumed

From frontend production runtime path:

- POST /v1/integrations/google/oauth/start
  - Used to initialize real OAuth flow and receive authorizationUrl + connectionId.
- POST /v1/integrations/google-ads/sync
  - Used for real sync execution.
- GET /v1/integrations/google-ads/records
  - Used to read persisted backend records and derive backend-driven runtime state/health checks.

## End-to-End Runtime Path

### Connect

Connections Center/New Connection Wizard
-> ConnectionManager
-> RestIntegrationRepository.createConnection
-> POST /v1/integrations/google/oauth/start
-> Browser redirect to authorizationUrl
-> Google OAuth callback handled by backend
-> Redirect back to frontend with callback params
-> Frontend resolves callback-linked connection and renders from backend-linked state

### Sync

Connections Center Sync action
-> ConnectionManager.runSync
-> RestIntegrationRepository.runSync
-> POST /v1/integrations/google-ads/sync
-> Backend persists sync outputs
-> Frontend refresh uses backend records endpoint
-> Connections Center cards refresh with backend-driven status/activity data

### Data Display

Cards and activity are loaded from backend-linked repository state and backend responses.
No fixture connection generation remains in the production runtime path.

## Validation Performed

- TypeScript validation: npm run typecheck -> PASS

## Notes

- UI structure and visual design were left intact.
- Backend behavior was not changed.
- OAuth backend implementation was not changed.
- Google Ads backend integration implementation was not changed.
