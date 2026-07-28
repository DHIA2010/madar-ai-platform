# GOOGLE_OAUTH_START_400_ANALYSIS

Date: 2026-06-28
Mode: Read-only analysis

## 1. Exact Endpoint Receiving The Request

- Method: POST
- Endpoint: /v1/integrations/google/oauth/start
- Receiver: [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L226)

## 2. Request Body Received By The Backend

Frontend request is constructed in:
- [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L259)
- [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L260)
- [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L261)

Body shape sent:
- workspaceId: input.workspaceId
- projectId: null
- connectionName: input.metadata?.connectionName ?? input.metadata?.accountName ?? null

Concrete failing body reproduced against running backend:
```json
{
  "workspaceId": "ws_northstar_marketing",
  "projectId": null,
  "connectionName": "Google Ads Connection"
}
```

## 3. Validation Schema / DTO Applied

The route parses request body with:
- [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L231)

Schema:
- [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L102)
- [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L103)
- [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L104)
- [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L105)

Relevant rule:
- workspaceId must be a UUID when provided.

## 4. Validation Rule That Rejects The Request

Rejected field:
- workspaceId

Rejecting rule:
- workspaceId: z.string().uuid().nullable().optional()
- [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L103)

Provided value:
- ws_northstar_marketing

Why rejected:
- Not a valid UUID format.

## 5. Exact Exception Thrown

Exception class:
- z.ZodError

Thrown at parse point:
- [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L231)

Issue details (from runtime response):
- path: workspaceId
- code: invalid_format
- message: Invalid UUID

## 6. Exact Response Returned To The Frontend

Route-wide Zod error handler:
- [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L399)
- [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L401)

Observed HTTP response:
- Status: 400 Bad Request
- Body:
```json
{
  "code": "VALIDATION_ERROR",
  "category": "validation",
  "message": "Request validation failed.",
  "details": [
    {
      "path": "workspaceId",
      "code": "invalid_format",
      "message": "Invalid UUID"
    }
  ]
}
```

## 7. Root Cause

The OAuth start request includes workspaceId sourced from frontend workspace state, and that value is non-UUID (example: ws_northstar_marketing). The backend schema requires UUID for workspaceId, so request validation fails before OAuth redirect logic executes.

Frontend source of workspaceId:
- [src/features/integrations/components/new-connection-wizard.tsx](src/features/integrations/components/new-connection-wizard.tsx#L432)

Non-UUID workspace id pattern example exists in workspace mock data:
- [src/infrastructure/workspace/mock-workspace-data.ts](src/infrastructure/workspace/mock-workspace-data.ts#L62)

Backend reject rule:
- [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L103)

Root Cause:
workspaceId value is not UUID, but backend requires UUID.

File:
[src/identity-platform/schemas.ts](src/identity-platform/schemas.ts)

Line:
[src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L103)
