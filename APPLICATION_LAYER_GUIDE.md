# APPLICATION_LAYER_GUIDE

## Purpose
The application layer coordinates use cases, enforces orchestration rules, and depends only on domain abstractions and infrastructure ports.

## Main Components
- `application/commands`
- `application/queries`
- `application/dto`
- `application/handlers/command-handlers.ts`
- `application/handlers/query-handlers.ts`
- `application/ports`
- `application/errors/IdentityError.ts`

## Implemented Use Cases
- Register user
- Verify email
- Login user
- Refresh session
- Logout
- Revoke session
- Request password reset
- Reset password
- Update profile
- Change email
- Change password
- Create organization
- Update organization
- Create workspace
- Update workspace
- Invite member
- Accept invitation
- Switch workspace

## Rules
- Handlers may compose multiple repositories.
- Handlers may call ports such as token service, rate limiter, email gateway, logger, clock, and ID generator.
- Handlers must not depend on REST or Node HTTP types.
- Handlers must return application DTOs or domain-derived state only.

## Testability
- Use cases are testable through handler invocation with injected in-memory adapters.
- No transport bootstrapping is required to test business flows.
