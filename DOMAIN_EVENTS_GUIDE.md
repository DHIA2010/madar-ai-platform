# DOMAIN_EVENTS_GUIDE

## Current Domain Events
- `UserRegistered`
- `EmailVerificationRequested`
- `PasswordResetRequested`
- `OrganizationCreated`
- `WorkspaceCreated`
- `InvitationAccepted`
- `SessionRevoked`
- `PasswordChanged`

## Publication Boundary
Events are published from application handlers after state changes are persisted.

## Metadata
Every event includes:
- event id
- event version
- aggregate type
- aggregate id
- occurrence timestamp
- request id
- correlation id

## Versioning Strategy
Current version is `1` for all events. Future contract changes should increment `eventVersion` rather than reusing the same shape silently.
