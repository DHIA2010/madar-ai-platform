# Repository Audit (Sprint 1)

Date: 2026-06-26

## Overall Score

- Repository score: 87/100
- Architecture score: 89/100
- Maintainability score: 85/100
- Code quality score: 92/100
- Documentation score: 82/100

## Technical Debt Summary

- Large number of legacy/demo routes and static pages increases surface area.
- Many unused exports reported by static analysis are framework/library-facing and not immediately removable without broader route pruning.
- Documentation had sprint-history noise mixed with active operational guides.
- Duplicate assets and duplicate route wrappers existed.

## Repository Complexity

- Application routes generated in build: 1300+ static/SSG pages.
- Terraform structure: multi-environment with shared modules, validated.
- CI/CD: separate quality, infra, and deployment workflows.

## Top 20 Findings

1. Missing runtime dependencies caused build/typecheck/test failures (`react-hook-form`, `@hookform/resolvers`, `zod`, `postcss`).
2. Lint allowed warnings previously; quality gate now enforced as zero warnings.
3. Accessibility warning in mocked select trigger (`combobox` ARIA props missing).
4. Next.js lint warnings from intentional `<img>` usage in blob/local previews.
5. Duplicate static assets in `public/cards/*` and `public/images/cards/*`.
6. Obsolete sprint documents mixed with active docs.
7. README incomplete and not operationally useful for onboarding.
8. Missing development/deployment/environment guide docs in current structure.
9. Workflow reliability gaps (no concurrency guards, no timeout limits).
10. ECS deployment workflow lacked explicit rollback on failed stabilization.
11. Terraform generated artifacts (`tfstate`, `tfplan`, `.terraform`) not fully ignored by git rules.
12. Dependency audit showed production vulnerabilities requiring follow-up triage.
13. `check:env` fails in local shell without full env var set (expected but requires documentation).
14. Knip reports large unused-export inventory requiring phased cleanup.
15. Duplicate admin page wrappers exist under multiple path prefixes (kept to avoid route behavior change).
16. Several old markdown files reference sprint plans no longer current.
17. Docker frontend file had unused stage, increasing maintenance overhead.
18. CI workflows had no concurrency controls; potential overlap race risk.
19. Repo includes historical AWS docs with mixed status and ownership boundaries.
20. Route volume and demo content increase long-term maintenance cost.

## Recommendations

- Keep strict quality gates as mandatory merge requirements.
- Triage and fix production vulnerabilities from `npm audit` as a dedicated security sprint.
- Continue phased dead-code cleanup using route usage telemetry, not static-only assumptions.
- Consolidate duplicated admin route wrappers into aliases/redirect strategy in Sprint 2.
- Add ownership metadata per major docs folder.
- Keep sprint history in `docs/archive/` only.

## Audit Evidence

- Gates executed: `npm install`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `terraform fmt -recursive -check`, `terraform validate` for all roots.
- Result: all gates pass.
