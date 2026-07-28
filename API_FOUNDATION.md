# API Foundation

## Objective
Standardize REST behavior across backend modules.

## Source

- `src/backend-foundation/api-foundation.ts`
- integrated servers:
  - `src/identity-platform/interfaces/rest/server.ts`
  - `src/project-platform/interfaces/rest/server.ts`

## Standardized Elements

1. Response helpers
- `sendJson`
- `sendProblem` (`application/problem+json`)

2. Request parsing
- `readJsonBody`

3. Query parsing
- `parsePagination`
- `parseSort`
- `parseCsvFilter`

4. Error style
- Not-found mapped via `createNotFoundProblem`
- Validation mapped to Problem Details payload

5. Lifecycle endpoints
- `/live`
- `/health`
- `/ready`
- `/version`

## RFC7807 Alignment

Problem responses now include:

- `type`
- `title`
- `status`
- `detail`
- optional `extensions`

## Remaining Work

1. Full middleware-level auth/authorization standardization for project routes.
2. Common API versioning middleware for all module servers.
3. Shared filter/sort schema contracts exposed in OpenAPI components.
