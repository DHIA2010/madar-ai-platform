# Engineering Recommendations

Date: 2026-06-26

## High Priority

1. Security vulnerability triage and patching for production dependency graph (`npm audit --omit=dev`).
2. Add route ownership and lifecycle policy for legacy/demo route groups.
3. Reduce duplicate page wrappers with redirect/alias strategy to shrink maintenance burden.
4. Formalize env var contract in CI and local setup to prevent `check:env` drift.
5. Introduce dependency allowlist/denylist governance for runtime dependencies.

## Medium Priority

1. Phase dead-code cleanup using runtime route usage metrics plus static analysis.
2. Consolidate repeated index/barrel files where they provide no value.
3. Add CI artifact summaries for quality outputs (dead code, circular deps, dependency health).
4. Add workflow smoke-test jobs to verify deployment rollback path behavior.
5. Expand architecture decision records with module ownership map.

## Low Priority

1. Improve Docker layer caching with BuildKit cache mounts in CI builds.
2. Add additional lint rules for stricter import and naming consistency in non-governed folders.
3. Introduce markdown linting across docs.
4. Add generated dependency snapshots for weekly review.

## Future Improvements

1. Migrate static export mode toward hybrid rendering only where required by product architecture.
2. Introduce route-level performance budgets and bundle-size checks in CI.
3. Add formal runbooks for incident, rollback, and data restoration validation.
4. Introduce ADRs for feature boundary changes and cross-cutting architectural updates.
