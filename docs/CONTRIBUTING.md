# Contributing

## Branching

- `main`: production-ready branch
- `stage-foundation`: stage validation branch
- `feature/*`, `fix/*`, `docs/*`, `chore/*`: working branches

## Commit Messages

Use conventional commits:

- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `test:`
- `ci:`
- `chore:`

## Pull Requests

Before opening a PR:

```bash
npm run lint
npm run typecheck
npm test
npm run build
terraform fmt -recursive
terraform -chdir=terraform/environments/local validate
```

Requirements:

- Focused scope
- No unrelated generated diffs
- Updated docs for architecture/process changes
- No business logic changes unless explicitly scoped

## Architecture Rules

- Respect feature boundaries and public APIs
- Prefer `@/` alias imports
- Use route constants instead of hardcoded route strings
- Keep infrastructure concerns out of UI primitives

## Review Criteria

- Correctness and safety
- Maintainability and readability
- Boundary compliance
- Production readiness (lint/typecheck/test/build/terraform validate)
