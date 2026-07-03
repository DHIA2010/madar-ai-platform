# Organization Events

## Published Events
- `OrganizationCreated`
- `OrganizationUpdated`
- `OrganizationArchived`
- `OrganizationDeleted`
- `MemberInvited`
- `MemberJoined`
- `MemberRemoved`
- `OwnershipTransferred`
- `RoleAssigned`
- `RoleRevoked`
- `InvitationAccepted`
- `InvitationExpired`

## Delivery
- Events are published through the existing event publisher interface.
- In production mode, events are persisted through the existing outbox pattern.
- Event metadata includes request and correlation identifiers.

## Operational Notes
- Event publishing is coupled with command completion semantics.
- Audit logs complement events for human-readable traceability.
