# SECURITY_MODEL

## Authentication Security
- JWT access + rotating refresh model.
- Refresh token hashes at rest.
- Session revocation and token revocation support.

## Cookie and CSRF
- Refresh token stored in `HttpOnly` cookie.
- CSRF protection via double-submit token check.

## Password Security
- Bcrypt hashing (cost factor 12).
- Password reset token TTL and one-time use.

## Brute-force Protection
- Rate limiting plugin for API-level throttling.
- Account lockout on repeated failed logins.

## Replay Protection
- Refresh token rotation with old token revocation.
- Replay detection revokes compromised refresh record.

## Authorization
- Role-based permission enforcement per workspace membership.
- Foundation supports future custom roles via database schema.

## Audit Trail
- All auth/identity/org/workspace sensitive actions are audit logged.

## Hardening Notes
- Set production secrets via environment.
- Enforce HTTPS and secure cookies in production.
- Consider CSP, HSTS, and trusted proxy config at gateway layer.
# SECURITY MODEL

## Security layers
- Input validation with Zod for all public requests
- Authentication via signed JWT access tokens
- Session continuity and rotation via hashed opaque refresh tokens
- RBAC authorization checks in service layer + API guard rails
- Account lockout and request throttling against brute-force attacks
- Audit trail for authentication and identity mutations

## Threat mitigations
- Credential stuffing: rate limits + lockout policy
- Token replay: refresh token rotation and revocation
- Password disclosure: salted scrypt hashes only
- Unauthorized access: permission checks per operation
- Incident response readiness: structured audit logs

## Residual risks (Sprint 3)
- In-memory storage only in current implementation module (to be replaced with persistent repositories)
- In-memory rate limiter is single-node scoped (to be moved to distributed store)
- JWT secret management currently environment-variable based; needs KMS-backed secret rotation in platform sprint
