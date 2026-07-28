# BACKEND_WORKSPACE_VALIDATION_TRACE

Date: 2026-06-28
Mode: Read-only backend trace

## Route Trace

1. HTTP router
- Route match for OAuth start:
  - [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L226)

2. Request parser
- Body parser used by route:
  - [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L40)
- It accumulates raw request chunks and returns JSON.parse(body).

3. Validation schema
- Route validation call:
  - [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L231)
- Schema definition:
  - [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L102)
  - [src/identity-platform/schemas.ts](src/identity-platform/schemas.ts#L103)

4. Controller
- Valid payload is passed to controller unchanged:
  - [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L232)
  - [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L27)

5. Service
- Controller passes input unchanged to service:
  - [src/identity-platform/google-oauth/controller.ts](src/identity-platform/google-oauth/controller.ts#L27)
  - [src/identity-platform/google-oauth/service.ts](src/identity-platform/google-oauth/service.ts#L240)

## What value is actually validated as workspaceId?

Runtime probe captured validator input directly (schema parse interception, read-only):

- Case A (UUID body):
  - validator input: `workspaceId = edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9`
  - result: validation passed, request continued to service and then failed later with configuration error (500)

- Case B (non-UUID body):
  - validator input: `workspaceId = ws_northstar_marketing`
  - result: validation failed immediately with 400 Invalid UUID

## Validation input source

Validation reads from request body only.

Evidence in route code:
- `googleOAuthStartSchema.parse(await readJsonBody(request))`
  - [src/identity-platform/interfaces/rest/server.ts](src/identity-platform/interfaces/rest/server.ts#L231)

Not used for this schema validation step:
- headers (`x-workspace-id` etc.)
- params
- actor context
- middleware substitutions

## Does backend replace body workspaceId before validation?

No replacement before validation.

Order is:
1. `readJsonBody(request)`
2. `googleOAuthStartSchema.parse(...)`
3. `googleOAuthController.start(actor, payload)`

Therefore any Invalid UUID at this stage means parsed request body itself contained non-UUID workspaceId.

## If validator gets correct UUID, why Invalid UUID still appears?

It does not appear in that request path.

When validator input is UUID, schema passes. Any subsequent failure is a different error (in current runtime: `GOOGLE_OAUTH_CONFIGURATION_ERROR` -> 500), not UUID validation.

## Runtime Probe Evidence (read-only)

Captured logs from probe requests:

- `[validator-input] {"workspaceId":"edbd4b4d-9753-4ccd-a66d-d97b3f0fdac9", ...}`
- `[probe-result] valid status=500 ...` (configuration error path)

- `[validator-input] {"workspaceId":"ws_northstar_marketing", ...}`
- `[probe-result] invalid status=400 ... Invalid UUID`

Conclusion:
- Backend validator is functioning correctly and validating parsed JSON body value directly.
- UUID-validation 400 is caused by a request whose JSON body still contains non-UUID workspaceId.
