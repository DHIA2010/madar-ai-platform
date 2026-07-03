# Testing Guide

## Objective
Standardize backend tests to support safe modular growth.

## Current Test Layers

1. Unit tests
- Domain and service logic (identity and project).

2. Repository contract tests
- Identity and project repositories (in-memory and PostgreSQL).

3. Integration tests
- Migration + repository integration using `pg-mem`.

4. HTTP tests
- Module REST behavior currently covered indirectly; can be expanded with request-level harness.

5. Migration tests
- `identity:migrations:validate`
- `project:migrations:validate`

## Foundation Utilities

- `src/backend-foundation/testing-foundation.ts`
  - `FixedClock`
  - `DeterministicUuidGenerator`
  - `defineRepositoryContract`

- `src/backend-foundation/tests/backend-foundation.test.ts`
  - module discovery/registry validation
  - request context creation validation

## Validation Commands

- `npm test`
- `npm run typecheck`
- `npm run backend:foundation:validate`

## Recommended Expansion

1. Add shared HTTP test harness for module servers.
2. Add outbox/event retry behavior integration tests.
3. Add startup lifecycle tests (task ordering and shutdown guarantees).
