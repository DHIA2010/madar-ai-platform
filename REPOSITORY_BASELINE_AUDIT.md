# Repository Baseline Audit

Date: 2026-06-27
Scope: Sprint 5.6 release-baseline verification for repository cleanliness and production readiness (no new feature implementation).

## Executive Summary

- Backend foundation consolidation from Sprint 5.5 is integrated and structurally clean.
- All core quality and architecture gates pass.
- Docker local platform is healthy across all required services.
- OpenAPI and migration validation gates pass for identity and project platforms.
- One release blocker remains: `npm audit --audit-level=low` reports 4 vulnerabilities.

## Final Gate Evidence

### 1) Install

Command:

```bash
npm install
```

Result: PASS

- Install completes successfully.
- Lockfile resolves and repository dependencies install without script failures.

### 2) Security Audit

Command:

```bash
npm audit --audit-level=low
```

Result: FAIL (release blocker)

Current findings:

- `next` advisory set (high): fix path requires `npm audit fix --force` to `next@16.2.9` (outside current declared range policy during baseline freeze).
- `nodemailer` advisory set (high): fix path requires breaking major to `nodemailer@9.0.1`.
- `postcss` (moderate): transitively linked through `next` advisory/fix path.
- `xlsx` (high): no fix currently available in registry advisory output.

Current count:

- 4 vulnerabilities total (1 moderate, 3 high).

### 3) Lint

Command:

```bash
npm run lint
```

Result: PASS

### 4) Type Check

Command:

```bash
npm run typecheck
```

Result: PASS

### 5) Tests

Command:

```bash
npm test
```

Result: PASS

- 55 test files passed
- 165 tests passed

### 6) Build

Command:

```bash
npm run build
```

Result: PASS

- Next.js production build succeeds.

### 7) OpenAPI Generation

Commands:

```bash
npm run identity:openapi
npm run project:openapi
```

Result: PASS

- Identity OpenAPI generated at `src/identity-platform/openapi/openapi.json`.
- Project OpenAPI generated at `src/project-platform/openapi/openapi.json`.

### 8) Migration Validation

Commands:

```bash
npm run identity:migrations:validate
npm run project:migrations:validate
```

Result: PASS

- Identity migrations validated.
- Project migrations validated.

### 9) Repository Contract Tests

Command:

```bash
npm test -- src/identity-platform/tests/repository-contract.test.ts src/project-platform/tests/project-platform.test.ts
```

Result: PASS

- 2 test files passed
- 4 tests passed

### 10) Architecture Boundaries and Cycles

Commands:

```bash
npm run lint:boundaries
npm run check:circular
```

Result: PASS

- dependency-cruiser: no violations.
- madge: no circular dependencies.

### 11) Docker Compose Runtime Health

Commands:

```bash
docker compose config -q
docker compose ps
```

Result: PASS

All required services healthy:

- backend
- frontend
- postgres
- redis
- minio
- mailpit

## Dependency and Dead-Code Baseline

### Dependency Drift

Commands:

```bash
npm outdated
npm run check:deps
```

Status: REVIEW REQUIRED

- Outdated packages exist (both minor/patch and multiple major upgrades available).
- `check:deps` report generation succeeds and includes full outdated/tree report.
- This is not a functional release blocker by itself, but it is maintenance debt.

### Dead Code / Unused Surface

Command:

```bash
npm run check:deadcode
```

Status: REVIEW REQUIRED

Knip reports substantial unused surface:

- Unused files: 59
- Unused dependencies: reported
- Unlisted dependencies: reported
- Unused exports/types: reported at scale

Interpretation:

- This repository has a large template/demo/UI surface; some findings are expected false positives.
- However, the current signal is too large to classify all findings as harmless without triage.
- Action needed: staged cleanup and explicit keep-list/ignore policy.

## Sprint 5.6 Baseline Conclusion

Repository baseline outcome:

- Structural and functional quality: GREEN.
- Security gate (`npm audit --audit-level=low`): RED.
- Release status for strict production-clean target: NOT READY.

Required decision to reach full-green baseline:

1. Approve controlled upgrade plan for `next` and `nodemailer` (with compatibility verification), and
2. Define compensating controls/acceptance for `xlsx` until upstream fix is available, or replace/remove dependency path.