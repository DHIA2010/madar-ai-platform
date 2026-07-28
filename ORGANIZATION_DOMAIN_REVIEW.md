# Organization Domain Review

## Scope
Sprint 4 extends the existing Identity Platform to deliver a production-ready Organization Platform without changing backend architecture or foundation patterns.

## Current Baseline (Before Sprint 4)
- Existing aggregates: `Organization`, `Workspace`, `Membership`, `Invitation`.
- Existing behavior: create/update organization, invite/accept invitation, basic membership role assignment.
- Existing gaps:
  - Organization lifecycle is incomplete (archive/restore/soft-delete invariants are missing).
  - Organization profile/settings are partial (no explicit branding/timezone/locale/currency/subscription reference model).
  - Membership states and transitions are under-specified (no suspend/reactivate/remove/ownership-transfer flows).
  - Invitation lifecycle is partial (no decline/cancel/resend/expiration handling/idempotency).
  - Role management lacks role history and explicit assignment/revocation workflows.
  - Domain events are incomplete for Organization Platform milestones.

## Target Domain Boundaries
- Organization Aggregate:
  - Identity and lifecycle: create, rename, archive, restore, soft delete.
  - Profile and settings: metadata, branding, logo, timezone, locale, currency, subscription reference, security/preferences/notification/audit config.
  - Ownership and governance constraints.
- Membership Aggregate Root (organization-scoped):
  - Member lifecycle: invited, active, suspended, removed.
  - Role assignment/revocation and role history.
  - Ownership transfer constraints.
- Invitation Aggregate:
  - State transitions: pending, accepted, declined, canceled, expired.
  - Expiration, resend/cancel controls, idempotency, rate-limit integration.

## Aggregate Rules and Invariants
- Organization
  - Name must be non-empty and bounded.
  - Cannot restore a non-archived organization.
  - Cannot archive/delete an already deleted organization.
  - Soft delete is terminal for write operations.
  - Owner must always be an active organization member with role `owner`.
- Membership
  - Organization must always have at least one active `owner`.
  - Only authorized actors can remove/suspend/reactivate/assign/revoke roles.
  - Cannot suspend/remove the last active owner.
  - Ownership transfer requires target member active in same organization.
- Invitations
  - Invitation token/idempotency pair maps to one logical invitation request.
  - Accepted/declined/canceled invitations are immutable terminal states.
  - Expired invitations cannot be accepted.
  - Invitation email must match accepting member identity.

## Ownership and Authorization Model
- Built-in roles remain: owner, admin, manager, analyst, viewer.
- Permission inheritance remains role-based and resolved through existing RBAC service.
- Custom roles are future-ready by storing role code/history in domain state and persistence model.

## Lifecycle and State Transitions
- Organization: active -> archived -> active, active -> deleted, archived -> deleted.
- Membership: invited -> active, active -> suspended, suspended -> active, active|suspended -> removed.
- Invitation: pending -> accepted|declined|canceled|expired.

## Integration Points (Must Reuse Existing Foundation)
- Domain events published through existing event publisher and outbox.
- Audit trails persisted through existing audit repository.
- Feature flags checked through existing provider abstraction.
- Observability emitted through existing metrics/logger abstractions.
- Persistence uses existing repository interfaces and adapters (memory/postgres/redis where relevant).

## Implementation Safety Notes
- No architecture refactor is required or planned.
- No AWS infrastructure/deployment changes are required or planned.
- Organization module implementation will be additive and compatible with existing Identity Platform interfaces.
