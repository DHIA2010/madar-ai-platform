# Release Baseline

Date: 2026-06-27
Scope: Sprint 5.6 production-clean release baseline.

## Scorecard

Scale:

- 10 = excellent / no material risk
- 7-9 = good with bounded risk
- 4-6 = needs focused remediation
- 0-3 = release-blocking condition

### Repository Health: 8/10

- Lint, typecheck, tests, build all pass.
- Architecture boundaries and cycle checks pass.
- Residual debt remains in dependency/security and dead-code inventory.

### Architecture Health: 9/10

- Sprint 5.5 backend-foundation consolidation is integrated.
- Identity/project runtime coupling reductions are in place.
- Dependency-cruiser and madge are clean.

### Maintainability Health: 7/10

- Foundation contracts and shared primitives are established.
- Documentation coverage improved.
- Knip reports significant unused surface requiring triage/removal.

### Dependency Health: 4/10

- Outdated package pressure includes several majors.
- `npm audit --audit-level=low` still fails.
- One advisory (`xlsx`) has no available fix.

### Test Health: 9/10

- Full suite passes (165/165).
- Repository contract subset passes.

### Docker Health: 9/10

- Compose config validates.
- Core local services show healthy status concurrently.

### OpenAPI Health: 9/10

- Identity and project OpenAPI exports execute successfully.

### Migration Health: 9/10

- Identity and project migration validators pass.

## Remaining Technical Debt

1. Security audit blocker (critical for release baseline):
   - `next` advisories require forced upgrade path.
   - `nodemailer` advisories require breaking-major path.
   - `xlsx` advisories currently have no fix.
2. Dead-code and export-surface debt:
   - Knip output indicates large cleanup backlog and dependency declaration mismatches.
3. Dependency drift:
   - Broad set of minor/major upgrades pending.

## Release Readiness Decision

Decision: CONDITIONAL / NOT RELEASE-READY under strict "production-clean" policy.

Rationale:

- Functional, architectural, and operational gates are green.
- Security policy gate remains red due to unresolved audit vulnerabilities.

## Required Actions To Flip To READY

1. Security remediation path approval:
   - Execute and validate controlled upgrade plan for `next` and `nodemailer`.
   - Resolve/replace/sandbox `xlsx` usage, or formally accept risk with documented compensating controls and expiry.
2. Dead-code/dependency hygiene sprint:
   - Triage knip findings into: remove, keep+document, or ignore with rationale.
   - Reconcile unlisted/unused dependency declarations.
3. Re-run full gate chain and reissue this baseline with all-green status.

## Final Sprint 5.6 Statement

Sprint 5.6 achieved a clean architectural and operational baseline with verified quality gates across lint/type/test/build/openapi/migrations/docker and dependency boundaries. The remaining blocker is dependency security posture, not backend foundation integrity. No integrations/OAuth feature expansion was performed as part of this baseline effort.