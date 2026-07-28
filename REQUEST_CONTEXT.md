# Request Context

## Goal
Provide a reusable request context model for all backend modules.

## Source

- `src/backend-foundation/request-context.ts`
- `src/backend-foundation/types.ts`

## Context Fields

- `requestId`
- `correlationId`
- `actor.userId`
- `actor.organizationId`
- `actor.workspaceId`
- `actor.projectId`
- `permissions[]`
- `logger`
- `transaction` (nullable slot)
- `ipAddress`
- `userAgent`
- `headers`

## Header Mapping

- `x-request-id`
- `x-correlation-id`
- `x-user-id`
- `x-organization-id`
- `x-workspace-id`
- `x-project-id`
- `x-permissions`

## Integration Status

- Identity middleware now builds request context through the shared foundation function and maps into identity DTO shape.
- Project and future modules can consume the full shared context directly.

## Next Hardening Steps

1. Inject authenticated actor and permissions from auth middleware instead of raw headers.
2. Bind transaction handles at request entrypoint when DB transactions are started.
3. Attach structured request-scoped logger enriched with ids and module metadata.
