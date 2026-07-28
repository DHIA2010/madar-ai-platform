# RBAC_GUIDE

## Roles
- Owner
- Admin
- Manager
- Analyst
- Viewer

## Permission Matrix (Foundation)
- Owner: full organization/workspace/identity/rbac access.
- Admin: organization read/update, workspace management, identity management, role assignment.
- Manager: workspace read/update/invite, identity read.
- Analyst: workspace read, identity read.
- Viewer: workspace read, identity own-read.

## Role Resolution
Resolved from membership record for active workspace.

## Permission Middleware
- API route verifies authenticated user.
- Role loaded from membership.
- `hasPermission(role, permission)` enforces policy.

## Custom Roles Readiness
Database includes `roles`, `permissions`, and `role_permissions` tables.
Runtime currently supports system roles but schema supports future custom roles without redesign.
# RBAC GUIDE

## Role model
System roles:
- `owner`
- `admin`
- `manager`
- `analyst`
- `viewer`

## Permission model
Core permissions:
- `org:read`, `org:write`, `org:invite`
- `workspace:read`, `workspace:write`, `workspace:switch`
- `membership:write`
- `session:read`, `session:revoke`
- `identity:read`, `identity:write`

## Enforcement
RBAC checks are performed in:
- domain service methods (authoritative)
- API handler gate checks (defense in depth)

## Custom role readiness
Schema includes role/permission mapping tables:
- `identity_roles`
- `identity_permissions`
- `identity_role_permissions`

This enables custom-role support in Sprint 4+ without changing auth/session contracts.
