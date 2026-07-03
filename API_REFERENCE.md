# API_REFERENCE

## Base
- Version: `v1`
- OpenAPI UI: `/docs`
- Health: `/api/health`

## Identity Platform Routes

Authentication:
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `POST /v1/auth/refresh`
- `POST /v1/auth/password/forgot`
- `POST /v1/auth/password/reset`
- `POST /v1/auth/email/verify`
- `GET /v1/auth/session`
- `POST /v1/auth/sessions/:id/revoke`

Identity:
- `GET /v1/identity/profile`
- `PATCH /v1/identity/profile`
- `POST /v1/identity/email/change`
- `POST /v1/identity/password/change`

Organizations:
- `POST /v1/organizations`
- `GET /v1/organizations/:id`
- `PATCH /v1/organizations/:id`
- `POST /v1/organizations/:id/invitations`
- `POST /v1/organizations/invitations/:token/accept`

Workspaces:
- `POST /v1/workspaces`
- `GET /v1/workspaces`
- `POST /v1/workspaces/switch`

RBAC:
- `GET /v1/rbac/permissions`
- `GET /v1/rbac/me`

Audit:
- `GET /v1/audit/logs`

## Error Model
```
{
  "error": {
    "code": "AUTH_UNAUTHORIZED",
    "message": "Unauthorized",
    "details": [],
    "correlationId": "...",
    "timestamp": "..."
  }
}
```
# API REFERENCE

## Versioning
All identity endpoints are versioned under `/v1`.

## Authentication
- Access token: Bearer JWT
- Refresh token: opaque rotating token

## Error envelope
```json
{
  "code": "AUTH_FORBIDDEN",
  "message": "Permission denied.",
  "details": {}
}
```

## Primary endpoints
- POST `/v1/auth/register`
- POST `/v1/auth/verify-email`
- POST `/v1/auth/login`
- POST `/v1/auth/refresh`
- GET `/v1/auth/session`
- POST `/v1/auth/logout`
- POST `/v1/auth/sessions/revoke`
- POST `/v1/auth/password/forgot`
- POST `/v1/auth/password/reset`
- GET/PATCH `/v1/identity/profile`
- GET/POST `/v1/workspaces`
- POST `/v1/organizations/invitations`
- GET `/v1/audit-logs`

## OpenAPI
OpenAPI document object is exported from:
- `src/identity-platform/openapi.ts`
