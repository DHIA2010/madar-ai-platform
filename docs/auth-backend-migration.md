# Sprint 2 Auth Backend Migration

This sprint keeps UI and UX unchanged and prepares authentication to run against real backend services through repository interfaces.

## Runtime Behavior

- Authentication uses the repository layer only.
- Mock authentication is available only when `NEXT_PUBLIC_APP_RUNTIME_MODE=mock`.
- In non-mock runtime modes, missing auth endpoint configuration throws a typed configuration error.
- Auth endpoint resolution order:
  1. `NEXT_PUBLIC_AUTH_API_BASE_URL`
  2. `NEXT_PUBLIC_API_BASE_URL` (fallback)

## Required Backend Endpoints

All endpoints are expected under the configured auth base URL.

1. `POST /auth/login`

- Request:

```json
{
  "email": "user@example.com",
  "password": "string",
  "rememberMe": true
}
```

- Response:

```json
{
  "user": {
    "id": "string",
    "email": "user@example.com",
    "fullName": "string",
    "emailVerified": true,
    "roles": [
      {
        "id": "string",
        "name": "string",
        "permissions": ["string"]
      }
    ],
    "permissions": ["string"]
  },
  "session": {
    "accessToken": {
      "token": "string",
      "tokenType": "Bearer",
      "expiresAt": "ISO-8601"
    },
    "refreshToken": {
      "token": "string",
      "expiresAt": "ISO-8601"
    },
    "issuedAt": "ISO-8601",
    "rememberMe": true,
    "strategy": "storage"
  }
}
```

2. `POST /auth/logout`

- Request:

```json
{
  "refreshToken": "string"
}
```

- Response: `204` or empty success body.

3. `GET /auth/me`

- Request headers: `Authorization: Bearer <access-token>`
- Response:

```json
{
  "user": {
    "id": "string",
    "email": "user@example.com",
    "fullName": "string",
    "emailVerified": true,
    "roles": [],
    "permissions": []
  }
}
```

4. `POST /auth/refresh`

- Request:

```json
{
  "refreshToken": "string"
}
```

- Response:

```json
{
  "accessToken": {
    "token": "string",
    "tokenType": "Bearer",
    "expiresAt": "ISO-8601"
  },
  "refreshToken": {
    "token": "string",
    "expiresAt": "ISO-8601"
  },
  "issuedAt": "ISO-8601",
  "rememberMe": true,
  "strategy": "storage"
}
```

5. `POST /auth/forgot-password`

- Request:

```json
{
  "email": "user@example.com"
}
```

- Response: empty success body.

6. `POST /auth/reset-password`

- Request:

```json
{
  "token": "string",
  "password": "string",
  "confirmPassword": "string"
}
```

- Response: empty success body.

7. `POST /auth/verify-email`

- Request:

```json
{
  "token": "string"
}
```

- Response: empty success body.

## Error Contract Expectations

The frontend maps auth failures to typed errors:

- `InvalidCredentialsError`
- `SessionExpiredError`
- `AuthenticationError`

Backend should return structured error codes/messages on auth failures, especially for:

- invalid credentials
- expired/invalid session
- expired/invalid refresh token
- unauthorized access

## Non-Goals (Sprint 2)

- OAuth flows
- workspace integration
- dashboard/business logic changes
- UI or UX changes
- direct live backend integration
