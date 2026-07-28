# Role Model

## System Roles
- `owner`
- `admin`
- `manager`
- `analyst`
- `viewer`

## Permission Inheritance
Permissions are resolved by the existing RBAC domain service using role union semantics.

## Assignment and Revocation
- Role changes are performed through explicit command handlers.
- Every role assignment is recorded in membership role history.
- Role updates trigger audit logs and `RoleAssigned` events.

## Ownership
- Owner role is managed as a strict invariant.
- Ownership transfer updates organization owner and member roles atomically at command level.

## Future Custom Roles
The persistence model stores role code and role history in a way that allows future custom-role expansion without architecture redesign.
