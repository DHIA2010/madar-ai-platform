# ADR_INDEX

## Active ADR Source Files
- `ARCHITECTURE_DECISION_RECORDS.md`
- `docs/DECISIONS.md`

## Identity Platform ADRs
- ADR-009: Identity backend should consolidate to one canonical implementation.
- ADR-010: Identity backend uses Clean Architecture with inward-only dependencies.
- ADR-011: Repository interfaces live in the domain boundary and adapters implement them.
- ADR-012: REST is a thin transport adapter over application handlers.
- ADR-013: Configuration is centralized under `src/identity-platform/configuration`.
- ADR-014: Observability context starts with request IDs, correlation IDs, health, readiness, and audit hooks.
- ADR-015: In-memory adapters remain acceptable only as replaceable infrastructure during architecture hardening.

## Review Note
Sprint 3.1 updated architecture quality and boundaries, but did not introduce PostgreSQL or Redis production adapters. That work is intentionally deferred behind the new ports.
