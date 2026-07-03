# Membership Guide

## Membership Model
Membership is organization-scoped and supports optional workspace linkage.

## Lifecycle States
- `invited`
- `active`
- `suspended`
- `removed`

## Supported Operations
- Invite member
- Accept invitation
- Suspend member
- Reactivate member
- Remove member
- Update member profile
- Assign role
- Transfer ownership

## Audit and History
Each membership stores:
- Status history with actor and timestamp.
- Role history with actor and timestamp.
- Profile changes through explicit command handling.

## Invariants
- Last active owner cannot be removed or suspended.
- Ownership transfer target must be an active member in the same organization.
- Membership state transitions are validated in domain entity methods.
