# Contributing Guide

This guide defines how engineering changes should be proposed and reviewed in MADAR.

## Branch Strategy

Recommended branch naming:

- `main`: protected production-ready branch
- `develop` (optional): integration branch for coordinated releases
- Feature branches: `feature/<scope>-<short-description>`
- Fix branches: `fix/<scope>-<short-description>`
- Docs branches: `docs/<short-description>`

Rules:

- Branch from the active integration branch (`main` or `develop`)
- Keep branches focused on one logical change set
- Rebase/merge frequently to reduce drift

## Commit Message Format

Use conventional-style commits:

- `feat: add dashboard KPI trend cards`
- `fix: correct table sorting state reset`
- `docs: expand architecture and design system guides`
- `refactor: simplify sidebar menu state handling`
- `chore: update lint configuration`

Guidelines:

- Subject line in imperative mood
- Keep subject concise and specific
- Use body for context when needed

Enforced commit types:

- `feat`
- `fix`
- `refactor`
- `docs`
- `style`
- `test`
- `build`
- `ci`
- `perf`
- `chore`

Commit messages are validated automatically by commitlint in the `commit-msg` hook.

## Pull Request Checklist

Before opening a PR:

- Ensure build and type checks pass locally
- Run lint checks and resolve actionable issues
- Keep scope aligned with PR title and description
- Update docs when architecture, behavior, or conventions change
- Include screenshots/videos for UI changes
- Confirm no unrelated file changes are included

Mandatory local quality gates:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run lint:architecture`
- `npm run lint:boundaries`
- `npm run lint:routes`
- `npm run check:circular`

Recommended full gate run:

- `npm run quality`

## Code Review Expectations

Reviewers should verify:

- Architectural fit and boundary compliance
- Readability and maintainability
- Accessibility and responsive behavior for UI changes
- Error handling and state correctness
- No hidden regressions in shared components

Author expectations:

- Respond to feedback promptly
- Explain non-obvious tradeoffs
- Prefer follow-up commits over force-push history rewrites during active review

## Coding Standards

Core standards:

- TypeScript strict-mode compatible code
- Prefer composable, single-responsibility components
- Use `@/` path aliases for internal imports
- Use semantic design tokens and shared UI primitives
- Keep feature logic out of low-level reusable components

Quality standards:

- Avoid large unstructured components when extraction improves clarity
- Avoid introducing dead code or duplicate UI variants without reason
- Keep naming consistent and intention-revealing

## Folder Conventions

Expected ownership:

- `src/app`: routes, route layouts, and route-level orchestration
- `src/components/ui`: reusable design-system primitives
- `src/components`: composed feature and shell components
- `src/providers`: app-wide provider wiring
- `src/store`: global/shared client stores only
- `src/lib`: framework-agnostic utilities and future service adapters
- `docs`: engineering and product documentation

Boundary rule:

- Route files compose existing building blocks; they should not become dumping grounds for reusable primitives.

## Architecture Restrictions

The architecture documents are frozen. Contributions must follow these restrictions:

- Feature code must not import other features' internal files.
- Cross-feature imports must target a feature public API (`src/features/<feature>/index.ts`) only.
- Feature code must not import `src/components/ui/*` directly; use `src/components/app/*` wrappers.
- Feature code must not import infrastructure internals directly (`src/lib/query`, `src/lib/errors`, `src/lib/logger`, `src/services/api-client`) unless exposed by approved public APIs.
- Route strings must use centralized route constants from `src/constants/routes.ts`.
- Keep layering direction: Presentation -> Application -> Domain -> Infrastructure.

Enforcement:

- ESLint architecture rules (`eslint.config.mjs`)
- Dependency Cruiser boundaries (`.dependency-cruiser.cjs`)
- Circular dependency checks (`madge` + ESLint import cycle rule)

## Import Rules

Import ordering is automatically enforced in governed layers:

1. Node built-ins
2. Third-party packages
3. Shared infrastructure (`src/lib`, `src/services`, `src/providers`, `src/store`, `src/types`, `src/constants`)
4. App components (`src/components/app`)
5. Feature imports (`src/features`)
6. Relative imports

Additional rules:

- Prefer `@/` alias imports.
- Avoid deep relative imports when an alias path exists.

## Git Hooks

Husky hooks are mandatory:

- `pre-commit`: `lint-staged`, `typecheck`, `format:check`
- `commit-msg`: commitlint conventional commit validation
- `pre-push`: `typecheck`, tests (if present)

Run once after dependency install:

- `npm run prepare`

## Branch Strategy

- `main`: protected production branch
- `develop`: optional integration branch
- `feature/*`: feature work
- `fix/*`: bug fixes
- `docs/*`: documentation updates
- `chore/*`: tooling and governance changes

Pull request policy:

- Keep PR scope focused.
- Do not mix business features with infrastructure governance in one PR.
- Require passing CI quality gates before merge.
