# REST_API_GUIDE

## Responsibility Boundary
The REST layer is now a thin adapter.

Allowed responsibilities:
- Request parsing
- Zod validation
- Authentication token extraction
- Request context creation
- Calling application handlers
- HTTP response formatting
- Error mapping

Forbidden responsibilities:
- Entity mutation logic
- Session rotation logic
- Permission policy decisions
- Repository queries beyond transport concerns

## Main Files
- `src/identity-platform/interfaces/rest/server.ts`
- `src/identity-platform/interfaces/middleware/index.ts`
- `src/identity-platform/schemas.ts`

## Endpoints
The canonical endpoint surface is generated from:
- `src/identity-platform/interfaces/openapi/identity-openapi-spec.ts`

OpenAPI artifact:
- `src/identity-platform/openapi/openapi.json`

## Compatibility
Legacy import points still exist through `src/identity-platform/api.ts`, but they now delegate to the canonical layered implementation.
