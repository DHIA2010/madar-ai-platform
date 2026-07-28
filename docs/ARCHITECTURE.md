# Architecture

## Overview

MADAR is a Next.js 16 application organized with explicit layering and feature boundaries to support long-term maintainability.

Primary concerns:
- Presentation and routing: App Router pages and layouts
- Application orchestration: commands, queries, validators, DTOs, use-cases
- Infrastructure adapters: external services, repositories, transport concerns
- Shared abstractions: constants, utilities, providers, state, types

## Layered Model

```text
Presentation (src/app, src/components, src/features/*/components)
  -> Application (src/application, src/features/*/{commands,queries,validators})
    -> Domain contracts (src/application/contracts, src/features/*/types)
      -> Infrastructure (src/infrastructure, src/services)
      -> Backend Foundation (src/backend-foundation)
```

Rules:
- Feature slices should expose stable entrypoints via `index.ts`.
- Cross-feature imports should use public APIs only.
- UI primitives should be consumed through app-layer wrappers where governed.
- Route paths should use centralized route constants.
- Backend module metadata should depend on foundation type contracts, not foundation barrels, to avoid self-referential cycles.

## Source Tree Responsibilities

- `src/app`: route groups, layouts, route composition
- `src/features`: bounded feature modules
- `src/application`: shared application-level contracts/use-cases
- `src/infrastructure`: adapters, repository implementations, integration clients
- `src/backend-foundation`: shared backend runtime primitives (module registry, request context, API foundation, lifecycle, health, event contracts, postgres abstraction)
- `src/components/app`: app-approved component wrappers
- `src/components/ui`: lower-level UI primitives
- `src/lib`: shared utilities and helpers
- `src/providers`: global provider wiring
- `src/store`: global client state
- `src/constants`: shared constants (including routes)

## Runtime Architecture

- Rendering: static export-oriented Next.js build
- State: local component state + selective Zustand stores
- Validation: schema-based input validation in validators
- Data access: repository/adapters in infrastructure layer

## Terraform Architecture

- `terraform/modules/*`: reusable infrastructure modules
- `terraform/environments/*`: environment compositions (local/stage/stage-platform/production)
- `terraform/bootstrap`: backend/bootstrap primitives

Terraform is validated in CI and locally via `terraform fmt` and `terraform validate`; applies are controlled and manual.

## CI/CD Architecture

- `quality.yml`: lint/typecheck/test/build and governance checks
- `infrastructure.yml`: terraform plan/apply workflow with approvals
- `deploy-containers.yml`: image build/push and ECS deployment with rollback-on-failed-stabilization

## Security Architecture Notes

- No hardcoded secrets in source
- Runtime secrets expected from environment/secret stores
- Containers run as non-root users
- Terraform state and apply paths are separated from application delivery

## Known Constraints

- AWS account verification is currently pending for live deployment operations
- Repository-level readiness work can proceed independently of cloud provisioning
- Security dependency baseline is currently constrained by unresolved `npm audit` findings pending controlled dependency upgrade/risk acceptance.

## Sprint 5.6 Architecture Outcome

- Dependency boundary linting and circular dependency checks pass.
- Backend foundation consolidation is in place without introducing integration/OAuth feature expansion.
