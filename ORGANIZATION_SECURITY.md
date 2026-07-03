# Organization Security

## Controls
- Authorization enforced by RBAC permission checks.
- Ownership validation for privileged organization operations.
- Input validation enforced at REST boundary via zod.
- Invitation acceptance constrained by token validity and invitee email match.
- Replay resistance via invitation status transitions and idempotency keys.
- Rate limiting for invitation creation and resend endpoints.

## Audit
All mutating organization, membership, and invitation operations write audit records.

## Threat Model Summary
- Unauthorized mutation: mitigated by role checks.
- Token abuse: mitigated by expiration and status checks.
- Duplicate invitation abuse: mitigated by idempotency constraints.
- Privilege escalation: mitigated by ownership and role transition invariants.
