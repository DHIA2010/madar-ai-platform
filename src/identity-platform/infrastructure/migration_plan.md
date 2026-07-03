# Identity Schema Migration Plan

## Migration order

1. Create base user table: `identity_users`
2. Create organization/workspace tables: `identity_organizations`, `identity_workspaces`
3. Create RBAC catalog tables: `identity_roles`, `identity_permissions`, `identity_role_permissions`
4. Create memberships table with role FK: `identity_memberships`
5. Create session + token tables: `identity_sessions`, `identity_email_verification_tokens`, `identity_password_reset_tokens`
6. Create audit table: `identity_audit_logs`
7. Seed system roles and permissions
8. Seed role-permission mappings

## Rollout strategy

- Apply schema in stage first with feature flag disabled for writes.
- Backfill organizations/workspaces and memberships from existing tenant sources.
- Enable dual-write from auth flows to old and new stores for one sprint.
- Run consistency checks daily during dual-write.
- Cut read path to new identity tables after parity checks pass.
- Disable old write path after 1 full sprint of stable operation.

## Safety checks

- Migration is additive first; destructive changes are deferred.
- All tables include soft-delete (`deleted_at`) where long-lived entities exist.
- Unique indexes use partial conditions to ignore soft-deleted rows.
- All token tables store hashes only.
