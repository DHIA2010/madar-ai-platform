# AUTHENTICATION_GUIDE

## Scope
Authentication and session foundation for MADAR Identity Platform.

## Implemented Flows
- Register
- Login
- Logout
- Refresh token with rotation
- Password reset
- Email verification
- Session restore
- Session revocation

## Security Controls
- Access JWT (`15m`) and rotating refresh JWT.
- Refresh token stored hashed server-side.
- HTTP-only refresh cookie.
- CSRF check (`x-csrf-token` header vs cookie) for state-changing auth endpoints.
- Brute-force protection with account lockout.
- Global API rate limiting.

## Endpoints
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `POST /v1/auth/refresh`
- `POST /v1/auth/password/forgot`
- `POST /v1/auth/password/reset`
- `POST /v1/auth/email/verify`
- `GET /v1/auth/session`
- `POST /v1/auth/sessions/:id/revoke`

## Session Model
- Multiple device sessions supported.
- Session revocation invalidates corresponding refresh tokens.
- Password reset invalidates all existing sessions and refresh tokens.

## Account Lockout
- Failed attempts tracked per account.
- Account locked for 15 minutes after threshold is reached.

## Audit
Every authentication action writes to audit log stream with actor, action, and timestamp.
# AUTHENTICATION GUIDE

## Scope
Sprint 3 introduces the first production-ready identity/authentication foundation as a standalone backend module in `src/identity-platform`.

## Flows
- Register with organization bootstrap
- Email verification
- Login with lockout + brute-force protection
- Access token + refresh token rotation
- Session restore
- Logout and session revocation
- Forgot/reset password

## Security controls
- Password hashing via scrypt (`salt:key` format)
- Refresh token hashing at rest
- Access token lifetime: 15 minutes
- Refresh token lifetime: 7 days (30 with remember-me)
- Login lockout: 5 failed attempts, 15 minute lockout
- In-memory request rate limiting per IP and endpoint class
- Comprehensive audit logging for auth-sensitive actions

## Endpoints
- POST `/v1/auth/register`
- POST `/v1/auth/verify-email`
- POST `/v1/auth/login`
- POST `/v1/auth/refresh`
- GET `/v1/auth/session`
- POST `/v1/auth/logout`
- POST `/v1/auth/sessions/revoke`
- POST `/v1/auth/password/forgot`
- POST `/v1/auth/password/reset`

## Running locally
- Start server: `node --import tsx src/identity-platform/server.ts`
- Env vars:
  - `IDENTITY_PLATFORM_PORT` (default `4000`)
  - `IDENTITY_PLATFORM_JWT_SECRET` (required outside local dev)
