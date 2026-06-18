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

## Pull Request Checklist
Before opening a PR:
- Ensure build and type checks pass locally
- Run lint checks and resolve actionable issues
- Keep scope aligned with PR title and description
- Update docs when architecture, behavior, or conventions change
- Include screenshots/videos for UI changes
- Confirm no unrelated file changes are included

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
