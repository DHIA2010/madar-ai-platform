# POSTGRES_GUIDE

## Purpose
PostgreSQL is the durable system of record for identity entities, audit logs, feature flags, and outbox events.

## Implemented Components
- `src/identity-platform/infrastructure/postgres/database.ts`
- `src/identity-platform/infrastructure/postgres/repositories.ts`
- `src/identity-platform/infrastructure/postgres/migration-runner.ts`
- `src/identity-platform/infrastructure/postgres/outbox-event-publisher.ts`
- `identity-platform/migrations/001_identity_core.sql`
- `identity-platform/migrations/002_identity_production_foundation.sql`

## Capabilities
- Connection pooling via `pg`.
- Transaction support via `PostgresDatabase.withTransaction()`.
- Health checks via `SELECT 1`.
- Prepared statement naming on repository queries.
- Soft delete columns preserved in schema.
- Outbox persistence in the same datastore.

## Current Scope
- Durable repositories: users, organizations, workspaces, memberships, email verifications, password reset tokens, invitations, audit logs.
- Sessions remain Redis-backed by design.

## Notes
- Transaction support is available at the database abstraction boundary.
- Full optimistic locking is not yet introduced because current aggregates do not expose version fields.
