# ARCHITECTURE_REFACTOR_REPORT

## Scope Reviewed
- `identity-platform/src/server.mjs`
- `identity-platform/src/openapi-export.mjs`
- `identity-platform/test/auth.test.mjs`
- `src/identity-platform/**/*`
- `Dockerfile.backend`
- root `package.json`

## Executive Summary
The Identity Platform currently has two competing implementations:

1. A standalone Fastify service under `identity-platform/`
2. A separate TypeScript identity module under `src/identity-platform/`

This is the most serious architectural issue in the current sprint output. It creates duplicate runtime paths, duplicate contracts, duplicate security logic, and unclear ownership of the production backend surface.

The standalone Fastify service is operationally closer to a deployable API, but it places routing, validation, domain rules, persistence, security policy, token issuance, audit logging, and configuration in a single file.

The TypeScript module is somewhat better separated, but it still concentrates application logic, repository data access, rate limiting, JWT handling, and permission decisions inside a large service abstraction with in-memory infrastructure.

The system is functional, but it is not yet a long-term production architecture.

## Primary Findings

### 1. Duplicate Implementations
Severity: Critical

Evidence:
- `identity-platform/src/server.mjs`
- `src/identity-platform/server.ts`
- `Dockerfile.backend` points at the standalone package
- root scripts point at `src/identity-platform/server.ts`

Impact:
- No single source of truth for backend behavior
- Divergent API shapes and endpoint contracts are likely over time
- Testing can pass against one implementation while production runs another
- Documentation and OpenAPI can drift independently

Required action:
- Consolidate to one canonical identity backend architecture
- Keep one runtime surface and one dependency graph

### 2. Mixed Layers in the Fastify Runtime
Severity: Critical

Evidence:
- `identity-platform/src/server.mjs` contains route registration, validation, entity mutation, session creation, token rotation, RBAC checks, audit writes, and persistence operations

Impact:
- Routes are not thin adapters
- Business rules are coupled to Fastify request/response objects
- Use cases are not independently testable
- Infrastructure replacement becomes expensive

Required action:
- Move business decisions into Application and Domain layers
- Keep REST limited to validation, auth, mapping, and transport concerns

### 3. Domain Model Is Mostly Anemic
Severity: High

Evidence:
- Users, organizations, workspaces, sessions, and invitations are stored as mutable plain objects
- Invariants such as lockout, active status, email verification, invitation acceptance, and membership permissions are enforced procedurally in services/routes rather than on entities or domain services

Impact:
- Rules are easy to bypass when new endpoints are added
- Behavior is duplicated across use cases
- Domain correctness depends on call-site discipline

Required action:
- Introduce entities and value objects that own invariants
- Introduce domain services for cross-entity rules such as permission evaluation and session rotation

### 4. Concrete Infrastructure Is Embedded in Application Logic
Severity: High

Evidence:
- `bcrypt`, JWT signing, UUID generation, clock usage, and in-memory rate limiting are called directly from service logic
- repository constructor defaults to an in-memory implementation

Impact:
- Services are tightly coupled to infrastructure choices
- Swapping PostgreSQL, Redis, or external providers requires touching use-case logic
- Unit testing requires real implementations or special knowledge of internals

Required action:
- Depend on interfaces for repository, hasher, token service, clock, id generator, and event publisher
- Move implementations into infrastructure and wire them via dependency injection

### 5. Repository Boundary Is Leaky
Severity: High

Evidence:
- `src/identity-platform/repository.ts` exposes internal Maps directly
- application/service code iterates over raw repository collections and performs its own queries and mutations

Impact:
- Persistence model leaks into business logic
- Future PostgreSQL implementation would either duplicate business queries or distort repository contracts
- Repositories are not replaceable

Required action:
- Replace state bags with repository interfaces that express intent
- Keep query/mutation logic inside repository implementations only

### 6. Error Model Is Incomplete
Severity: Medium

Evidence:
- `src/identity-platform/errors.ts` contains a single generic error class with a small set of predefined errors
- Fastify implementation uses ad hoc error objects and HTTP mapping

Impact:
- Business, validation, security, and infrastructure failures are not consistently categorized
- Logging and transport mapping are inconsistent across implementations

Required action:
- Introduce explicit error taxonomy and one mapping strategy into HTTP responses and logs

### 7. Configuration Is Scattered
Severity: Medium

Evidence:
- Environment lookups are performed directly in server entrypoints
- token TTLs, lockout thresholds, and cookie flags are embedded in service/server modules

Impact:
- Hard to audit production behavior
- Configuration drift across modules is likely

Required action:
- Centralize configuration under a dedicated configuration layer

### 8. Observability Is Minimal
Severity: Medium

Evidence:
- health endpoint exists, but readiness, metrics hooks, tracing hooks, correlation IDs, and structured application-level error categorization are missing or inconsistent

Impact:
- Operational debugging is weaker than required for a foundational platform

Required action:
- Add observability abstractions and consistent request context propagation

### 9. Tests Are Behavior-Smoke Tests, Not Architectural Tests
Severity: Medium

Evidence:
- current tests exercise a few end-to-end flows only
- use cases are not isolated from transport or infrastructure

Impact:
- difficult to protect architecture during future growth
- low confidence when swapping persistence or auth infrastructure

Required action:
- add tests at domain, application, adapter, and integration levels

## Target Refactor Direction

Canonical structure to implement:

```text
src/identity-platform/
  domain/
    entities/
    value-objects/
    domain-services/
    events/
    repositories/
  application/
    commands/
    queries/
    handlers/
    dto/
  interfaces/
    rest/
    openapi/
    middleware/
  infrastructure/
    postgres/
    redis/
    jwt/
    email/
    logger/
    storage/
    queue/
  bootstrap/
  configuration/
  dependency-injection/
  server/
```

## Consolidation Decision
The refactor should consolidate onto the `src/identity-platform/` code path as the canonical implementation because:
- it is already TypeScript and integrates with existing workspace quality gates
- it already has some modular boundaries to build on
- it can be wired into a standalone HTTP server without carrying the current single-file Fastify design forward

The standalone `identity-platform/` package should stop being a second source of truth. It should either be removed or reduced to a packaging/runtime wrapper around the canonical implementation.

## Refactor Objectives
- One canonical identity implementation
- Thin REST adapter
- Explicit application use cases
- Infrastructure via interfaces only
- Domain entities and value objects that own invariants
- Centralized configuration
- Unified error model
- Request-scoped observability context
- Repository pattern with replaceable implementations

## Go/No-Go Baseline Before Refactor
Current status: No-Go for long-term foundational backend use.

Reason:
- feature-complete enough for a sprint prototype
- not acceptable yet as the stable foundation for every future MADAR backend module
