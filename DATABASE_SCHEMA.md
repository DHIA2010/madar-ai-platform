# DATABASE_SCHEMA

## Core Tables
- users
- organizations
- workspaces
- memberships
- roles
- permissions
- role_permissions
- sessions
- refresh_tokens
- email_verifications
- password_reset_tokens
- organization_invitations
- audit_logs

## Indexes and Constraints
- Unique email on users.
- Unique `(user_id, workspace_id)` on memberships.
- Foreign keys across org/workspace/user relationships.
- Time-based indexes for sessions/tokens/audit.

## Migration Order
1. users
2. organizations
3. workspaces
4. roles/permissions/role_permissions
5. memberships
6. sessions
7. refresh_tokens
8. email_verifications
9. password_reset_tokens
10. organization_invitations
11. audit_logs

## Retention
- Sessions/tokens: short retention and periodic cleanup.
- Audit logs: long retention (policy-driven, minimum 24 months).
- Soft deleted entities retained for compliance and forensics.

Detailed SQL: `identity-platform/migrations/001_identity_core.sql`.
# DATABASE SCHEMA

## Artifact location
- SQL DDL: `src/identity-platform/infrastructure/identity_schema.sql`
- Migration rollout: `src/identity-platform/infrastructure/migration_plan.md`

## Tables
- `identity_users`
- `identity_organizations`
- `identity_workspaces`
- `identity_roles`
- `identity_permissions`
- `identity_role_permissions`
- `identity_memberships`
- `identity_sessions`
- `identity_email_verification_tokens`
- `identity_password_reset_tokens`
- `identity_audit_logs`

## Critical constraints
- Unique email at user layer
- Unique role code and permission code
- Membership uniqueness via partial unique index on active rows
- Refresh token hash uniqueness on active sessions

## Index strategy
- Lower(email) active-user index
- Membership user lookup index
- Session active lookup index
- Audit actor/org timeline indexes

## Migration strategy
Additive-first, dual-write validation, then read cutover to new identity schema.
