# Cleanup Report (Sprint 1)

Date: 2026-06-26

## Refactored

- `package.json`
  - Added explicit dependencies required by source imports via install (`react-hook-form`, `@hookform/resolvers`, `zod`, `postcss`).
  - Updated `lint` script to `--max-warnings=0`.

- `postcss.config.js`
  - Converted to CommonJS export to remove Node module-format warnings in build/test.

- `src/features/administration/components/administration-invitations-screen.test.tsx`
  - Added required `combobox` ARIA attributes in test mock to satisfy lint accessibility checks.

- `src/features/campaigns/components/campaign-details-view.tsx`
  - Added focused lint suppression for intentional native image preview usage.

- `.github/workflows/quality.yml`
  - Added concurrency and timeout safeguards.

- `.github/workflows/infrastructure.yml`
  - Added concurrency and timeout safeguards.

- `.github/workflows/deploy-containers.yml`
  - Added concurrency, timeout, shell strict mode, and rollback on failed ECS stabilization.

- `Dockerfile.frontend`
  - Removed unused dependencies stage to reduce maintenance complexity.

- `.gitignore`
  - Added Terraform generated artifact ignore rules (`.terraform`, `tfstate`, `tfplan`, crash/override files).

## Removed

Unused duplicate asset set (kept active `/public/images/cards/*` paths):

- `public/cards/basic/01.jpeg`
- `public/cards/basic/02.jpeg`
- `public/cards/basic/03.jpeg`
- `public/cards/basic/04.jpeg`
- `public/cards/blog/01.jpeg`
- `public/cards/blog/02.jpeg`
- `public/cards/blog/03.jpeg`
- `public/cards/blog/04.jpeg`
- `public/cards/blog/05.jpeg`
- `public/cards/blog/06.jpeg`
- `public/cards/blog/07.jpeg`
- `public/cards/eComm/01.png`
- `public/cards/eComm/02.png`
- `public/cards/eComm/03.png`
- `public/cards/eComm/04.png`
- `public/cards/eComm/05.png`
- `public/cards/travel/01.jpeg`
- `public/cards/travel/02.jpeg`
- `public/cards/travel/03.jpeg`

Reason: confirmed duplicates of `public/images/cards/*` and not referenced by code.

## Moved / Archived

Moved obsolete sprint docs to archive:

- `docs/auth-backend-migration.md` -> `docs/archive/sprint/auth-backend-migration.md`
- `docs/stage-integration-plan.md` -> `docs/archive/sprint/stage-integration-plan.md`
- `docs/stage-readiness-report.md` -> `docs/archive/sprint/stage-readiness-report.md`
- `docs/aws/SPRINT_3_REFACTORED.md` -> `docs/archive/sprint/SPRINT_3_REFACTORED.md`
- `docs/aws/SPRINT_3_SUMMARY.md` -> `docs/archive/sprint/SPRINT_3_SUMMARY.md`

Reason: historical sprint artifacts; no longer current operational guides.

## Documentation Rewritten / Added

- Rewritten: `README.md`
- Rewritten: `docs/ARCHITECTURE.md`
- Rewritten: `docs/CONTRIBUTING.md`
- Added: `docs/DEVELOPMENT_GUIDE.md`
- Added: `docs/DEPLOYMENT_GUIDE.md`
- Added: `docs/ENVIRONMENT_GUIDE.md`

## Not Removed (Intentional)

- Duplicate route wrappers under administration prefixes were detected but not removed in Sprint 1 to avoid route behavior changes.
- Large unused-export inventory from static analysis left for phased Sprint 2 architecture cleanup.
- Terraform modules were all referenced by environment compositions; none removed.
