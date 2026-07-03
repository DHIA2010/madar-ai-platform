# Backend Architecture Review

## Scope
This review covers backend-capable modules and shared foundations currently present in the repository:

- Identity Platform (`src/identity-platform`)
- Project Platform (`src/project-platform`)
- Backend Foundation (new in Sprint 5.5, `src/backend-foundation`)
- Shared PostgreSQL access and outbox implementation (currently under Identity infrastructure)

## Current Module Boundaries

1. Identity Platform
- Owns authentication, sessions, users, organizations, workspaces, RBAC, invitations, and audit logs.
- Exposes REST server and OpenAPI export.
- Supports memory mode and production mode (PostgreSQL + Redis + SMTP + outbox).

2. Project Platform
- Owns projects, data sources, project invitations, and project memberships.
- Exposes REST server and OpenAPI export.
- Service layer supports repository abstraction with in-memory and PostgreSQL implementations.

3. Backend Foundation (Sprint 5.5)
- Owns shared runtime contracts for module discovery, request context, startup lifecycle, API problem responses, typed backend config, event serialization/retry interfaces, and health snapshots.
- Non-invasive: no domain/business behavior moved from working modules.

## Dependency Graph (High Level)

- Identity
  - Domain/Application -> Identity ports -> Identity infrastructure.
  - PostgreSQL, Redis, SMTP, outbox wired in DI container.
- Project
  - Domain/Application -> Project repositories -> In-memory or PostgreSQL repositories.
  - Reuses Identity Postgres database abstraction.
- Backend Foundation
  - Imported by Identity middleware/server and Project server for shared request/API foundations.
  - Provides module discovery for Identity/Project metadata.

## Shared Services and Patterns

1. Repository Pattern
- Identity repositories: in-memory + PostgreSQL implementations.
- Project repositories: in-memory + PostgreSQL implementations.
- Contract tests exist per module; project PostgreSQL tests bootstrap identity schema dependencies.

2. Event and Outbox
- Identity uses `PostgresOutboxEventPublisher` writing to `outbox_events`.
- Project publishes domain events through event publisher port, defaulting to in-memory when not injected.
- Foundation now defines provider-independent event envelope, serialization, and retry contracts.

3. REST Routing
- Identity routes are explicit and strongly validated via zod.
- Project routes are explicit and now aligned with standard lifecycle endpoints (`/live`, `/health`, `/ready`, `/version`).

4. OpenAPI Generation
- Identity and Project have independent OpenAPI spec/export scripts.
- Sprint 5.5 adds validated project OpenAPI export path creation.

5. RBAC
- RBAC logic currently centralized in Identity domain service and exposed via API.
- Project still uses system actor in REST server for several routes (technical debt).

6. Database Access
- Shared `PostgresDatabase` abstraction provides query + transaction + health check.
- AsyncLocalStorage transaction context exists in DB layer.

7. Configuration
- Identity has robust zod-based typed configuration.
- Frontend runtime config exists separately.
- Sprint 5.5 introduces backend foundation typed config for module/runtime metadata.

8. Docker Startup
- Docker compose starts infrastructure + backend (identity server).
- Bootstrap script runs migrations and development seed.
- Project server is available in code but not yet started in compose.

9. Testing
- Identity tests and project tests are present and passing.
- Sprint 5.5 adds backend-foundation tests for module registry discovery and request context.

## Strengths

- Clear modular folder boundaries for identity and project.
- Good repository abstractions and contract-style tests.
- Production-ready identity infra wiring (DB/Redis/SMTP/outbox).
- Existing health/readiness pattern in identity.
- Strong use of zod input validation and typed DTOs.

## Weaknesses

- Startup lifecycle is fragmented (compose bootstrap script + separate module servers).
- Project server still uses synthetic actor stubs in REST path.
- Shared API conventions were partially duplicated before foundation extraction.
- Outbox/event strategy is strong in identity but not uniformly consolidated across modules.

## Duplicate Logic

- Request body parsing and pagination parsing duplicated in module REST servers (now reduced via backend-foundation helpers).
- Non-unified error response shape between identity and project (now standardized toward Problem Details).

## Tight Coupling

- Project PostgreSQL repository depends on identity Postgres database class path.
- Project tests depend on identity migrations to bootstrap base entities.

## Technical Debt

- Compose starts only identity backend service; module monolith bootstrap is not yet default runtime.
- Organization capabilities exist inside identity module rather than a standalone organization module package.
- Security audit vulnerabilities remain in dependencies and require triage/upgrade strategy.
- Existing lint failures in frontend cycles are unrelated but block full green gate.

## Future Risks

- Adding future modules without registry/lifecycle discipline could recreate hardcoded bootstrap paths.
- Mixed error formats increase API client complexity if not fully converged on Problem Details.
- Dependency vulnerabilities include high/critical items (`next`, `jspdf`, `nodemailer`, `xlsx`); unresolved risk for production hardening.

## Sprint 5.5 Outcome

Backend foundations are now consolidated enough to support future module onboarding with lower friction, while preserving existing behavior and avoiding large-scale rewrites.
