# Development Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Terraform 1.8+

## Setup

```bash
npm install
```

## Local Development

```bash
npm run dev
```

## Quality Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run lint:boundaries
npm run check:circular
npm run check:deadcode
npm run check:deps
npm run identity:openapi
npm run project:openapi
npm run identity:migrations:validate
npm run project:migrations:validate
docker compose config -q
docker compose ps
npm audit --audit-level=low
```

## Sprint 5.6 Release Baseline

Required release-baseline command order:

```bash
npm install
npm audit --audit-level=low
npm run lint
npm run typecheck
npm test
npm run build
npm run identity:openapi
npm run project:openapi
npm run identity:migrations:validate
npm run project:migrations:validate
npm test -- src/identity-platform/tests/repository-contract.test.ts src/project-platform/tests/project-platform.test.ts
docker compose config -q
docker compose ps
```

Notes:

- `npm audit --audit-level=low` is a release gate for production-clean baselines.
- Dependency and dead-code checks are mandatory evidence inputs for baseline reports, even when they produce expected/legacy findings.

## Coding Standards

- Keep business behavior unchanged unless explicitly scoped
- Prefer strict typing and explicit contracts
- Use route constants instead of hardcoded route strings
- Respect feature boundary constraints
- Keep shared logic in reusable modules, not route files

## Testing

- Unit and component tests run with Vitest
- Keep tests deterministic and independent from remote services

## Pull Request Expectations

- Clear scope and rationale
- Passing quality gates
- Updated docs for architectural/process changes
- No unrelated generated file churn
