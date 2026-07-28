# DOMAIN_MODEL_REVIEW

## Reviewed Entities
- User
- Organization
- Workspace
- Membership
- Session
- EmailVerification
- PasswordReset
- Invitation
- AuditLog

## Entity Review

### User
- Invariants now owned by `UserEntity`.
- Email normalization enforced through `EmailAddress` value object.
- Login eligibility, lockout, email verification state, password change, and workspace switching are encapsulated.
- Remaining gap: password policy is still schema-level only and should move into a domain rule if policy becomes more complex.

### Organization
- `OrganizationEntity` owns mutable organization state updates.
- Status transition rules are still permissive; stricter transition guards can be added later without REST changes.

### Workspace
- `WorkspaceEntity` owns workspace updates and status changes.
- Workspace creation remains application-coordinated because it depends on organization membership and authorization.

### Membership
- Membership remains simple by design.
- Role assignment is explicit and scoped to organization/workspace.

### Session
- `SessionEntity` owns refresh rotation, expiry checks, and revocation.
- Session lifecycle is no longer expressed directly in the REST adapter.

### EmailVerification and PasswordReset
- Both token entities encapsulate token consumability checks.
- Token expiry and single-use behavior are domain-level concerns now.

### Invitation
- `InvitationEntity` encapsulates acceptability and acceptance state.
- Invitation email normalization is enforced at entity construction.

### AuditLog
- Audit entries are immutable append-only state objects.
- Audit creation is coordinated from application handlers, not REST.

## Value Objects
- `EmailAddress`

## Domain Services
- Permission resolution and permission checks are handled in `domain/domain-services/permission-service.ts`.

## Assessment
- The model is no longer purely anemic.
- The remaining limitation is not the layering, but the use of in-memory persistence adapters instead of durable infrastructure.
