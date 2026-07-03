# Backend Foundation

## Purpose
Sprint 5.5 introduces a shared backend foundation to keep all backend platforms aligned on the same architectural rules without rewriting working module internals.

Sprint 5.6 hardening verifies that this foundation is clean, minimal, and production-ready from an architectural standpoint.

## Implemented Foundation Components

1. Module Registry
- Source: `src/backend-foundation/module-registry.ts`
- Registers modules once and provides list/get/health aggregation.

2. Module Discovery Catalog
- Source: `src/backend-foundation/module-catalog.ts`
- Dynamically discovers module definitions for identity and project.

3. Request Context
- Source: `src/backend-foundation/request-context.ts`
- Creates shared request context including actor scope, request/correlation IDs, permissions, logger, and transaction handle slot.

4. API Foundation
- Source: `src/backend-foundation/api-foundation.ts`
- Shared JSON and Problem Details responses, body parsing, pagination, sorting/filter parsing, and not-found mapping.

5. Infrastructure Foundation
- Source: `src/backend-foundation/infrastructure-layer.ts`
- Shared logger, metrics, tracer, clock, UUID generator, foundation error and error-to-problem mapping.

6. Event Foundation
- Source: `src/backend-foundation/event-foundation.ts`
- Provider-independent event envelope, serializer/deserializer, retry strategy contract and default exponential backoff.

7. Configuration Foundation
- Source: `src/backend-foundation/configuration.ts`
- Typed backend environment parsing with feature-flag parsing.

8. Startup Lifecycle
- Source: `src/backend-foundation/startup-lifecycle.ts`
- Deterministic startup/shutdown task orchestration with phase state.

9. Health and Observability
- Source: `src/backend-foundation/health-observability.ts`
- Aggregated module health snapshot including lifecycle, environment, version, and build metadata.

10. Testing Foundation
- Source: `src/backend-foundation/testing-foundation.ts`
- Shared deterministic clock/UUID utilities and lightweight repository contract wrapper.

## Incremental Integration Completed

- Identity middleware now uses shared request-context generation.
- Identity REST server now includes `/version` and Problem Details for not-found/validation paths.
- Project REST server now includes `/live`, `/health`, `/ready`, `/version` and Problem Details responses.
- Identity and Project OpenAPI specs include standardized lifecycle endpoints.

## Validation Hooks Added

- `project:migrations:validate`
- `project:openapi`
- `backend:foundation:validate`

These are additive and do not alter existing domain or business logic.

## Hardening and Decoupling Outcomes (Sprint 5.6)

- Circular dependency risks from foundation barrel imports were removed by using direct type-level imports for module definitions.
- Project platform runtime coupling to identity internals was removed.
- Shared postgres database abstraction is centralized in `src/backend-foundation/postgres/database.ts` with identity compatibility re-export support.
- Cross-feature frontend cycle pressure affecting backend-quality gates was resolved through stricter public API boundaries.

## Verified Baseline Checks

Validated successfully:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run lint:boundaries`
- `npm run check:circular`
- `npm run identity:openapi`
- `npm run project:openapi`
- `npm run identity:migrations:validate`
- `npm run project:migrations:validate`

## Current Release Constraint

Backend foundation quality is validated. The remaining release-baseline blocker is dependency security posture (`npm audit --audit-level=low`), not backend foundation architecture or module coupling.
