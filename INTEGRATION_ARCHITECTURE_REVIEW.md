# Integration Architecture Review

## Current frontend connector flow

The current connector experience is driven from the Next.js frontend. The integration wizard creates local connection records, uses synthetic authorization codes, and advances UI state after local repository calls complete. The flow does not redirect the browser to a provider, does not validate OAuth state on the server, and does not persist provider tokens in PostgreSQL.

## Current mocked Google Ads connector

Google Ads is scaffolded as a connector, but the current implementation returns synthetic OAuth tokens and hardcoded account and sync data. The repository path still treats Google Ads as a locally authorized integration, which means the app can simulate a connected state without any provider round trip.

## Current backend boundaries

The backend foundation already follows a sibling-module pattern. Identity, organization, and project concerns are separated into their own modules with their own services, REST servers, OpenAPI stubs, migrations, and repository layers. The integration surface does not yet exist as a dedicated backend module, so connector behavior is still coupled to frontend orchestration and local state.

## Current repository pattern

Existing modules use explicit repository interfaces, in-memory implementations for tests and local mode, and PostgreSQL implementations for durable persistence. The project-platform and identity-platform modules both keep the repository contract narrow and move orchestration into a service layer. The integration platform should follow the same pattern so future connectors can reuse the same persistence and lifecycle abstractions.

## Current event system

The codebase already uses a domain-event model and a PostgreSQL outbox publisher. Events are written to `outbox_events` and consumed asynchronously. That is the correct foundation for connector lifecycle events, OAuth completion, sync status changes, credential rotation, and webhook registration.

## Current PostgreSQL layer

The PostgreSQL abstraction is already shared across platform modules. Migrations are SQL-first, repository implementations map rows to state objects, and the codebase already validates migrations in isolated tests. The integration platform should add its own schema rather than extending the identity or project tables.

## Current RBAC integration

Identity-platform already resolves actors, roles, permissions, and workspace membership. The integration platform can reuse the same `AuthenticatedActor` shape and authorization conventions so access control stays consistent across all platform modules.

## Why the Integration Platform is required

Google Ads exposed a structural gap: connector auth, credential storage, sync orchestration, and webhook handling are all cross-cutting concerns that do not belong in the frontend and do not belong inside provider-specific code. A dedicated integration platform is required so every future connector can reuse a single backend boundary for OAuth, credential lifecycle, sync scheduling, health, and event publishing.

Without this platform, each connector would re-implement its own auth, persistence, and background-job flow, which would recreate the current mock-first behavior and fragment the architecture. The platform creates a stable seam for Google Ads later, but it is intentionally provider-agnostic so the Google implementation can be reduced to registering a connector plus provider adapters.
