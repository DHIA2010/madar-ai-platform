# Delete Connection Backend Fix

## Root cause

The endpoint **does exist in backend source**, but the running backend process on port 4000 was stale and did not have the latest route registration loaded.

Evidence:

- With a valid bearer token, the request returned:
  - `DELETE /v1/integrations/2aa80279-419e-4b3d-8c32-2d9dea234e51 -> 404 {"code":"NOT_FOUND","message":"Endpoint not found."}`
- Backend process was a long-running Node process:
  - `node --import tsx src/identity-platform/server.ts`
- After restarting backend from current source, the same request returned:
  - `204 No Content`

This proves the issue was runtime process state (stale route table), not frontend behavior.

## Registered routes before

Observed in the running stale process:

- `/health` -> 200 (`service: identity-platform`)
- Auth routes reachable (`/v1/auth/login` worked)
- `DELETE /v1/integrations/:connectionId` returned 404, so delete route was not active in that process

From current backend source file (`src/identity-platform/interfaces/rest/server.ts`), delete route is defined as:

- `const deleteIntegrationMatch = url.pathname.match(/^\/v1\/integrations\/([^/]+)$/)`
- `if (method === "DELETE" && deleteIntegrationMatch) { ... return 204 }`

## Registered routes after

After restarting backend process from current source:

- `DELETE /v1/integrations/:connectionId` is active and returns `204 No Content`
- No path conflict with sync/records/accounts route:
  - `^/v1/integrations/([^/]+)/(sync|records|accounts)$`
- Ordering is correct:
  - delete handler is evaluated before provider action route
- Middleware/auth behavior:
  - bearer token is resolved before route handlers; invalid tokens return 401 before delete matching

## Route reachability investigation checklist

- Route registration: Present in `src/identity-platform/interfaces/rest/server.ts`
- Router mounting: Single `createServer` handler; no missing mount layer
- Path conflicts: None with `/(sync|records|accounts)` route
- Ordering: Delete check is before provider action check
- Middleware: Auth token resolution executes before delete check (expected)
- Parameter parsing: `([^/]+)` correctly captures UUID connection IDs

## File changed

- `DELETE_CONNECTION_BACKEND_FIX.md` (this report)

No frontend files were modified.

## Verification

### 1) Runtime endpoint verification

- Login succeeded and produced valid access token
- Request:
  - `DELETE /v1/integrations/2aa80279-419e-4b3d-8c32-2d9dea234e51`
- Result after backend restart:
  - `HTTP/1.1 204 No Content`

### 2) Database cascade verification

Target connection:

- `2aa80279-419e-4b3d-8c32-2d9dea234e51`

Pre-delete counts:

- `google_oauth_connections`: 1
- `google_ads_customer_accounts`: 0
- `google_ads_sync_runs`: 12
- `google_ads_sync_checkpoints`: 0
- `google_oauth_events`: 5
- `google_oauth_states`: 4
- `google_ads_domain_records`: 0
- `google_ads_sync_cursors`: 0
- `google_ads_sync_locks`: 0

Post-delete counts:

- `google_oauth_connections`: 0
- `google_ads_customer_accounts`: 0
- `google_ads_sync_runs`: 0
- `google_ads_sync_checkpoints`: 0
- `google_oauth_events`: 0
- `google_oauth_states`: 0
- `google_ads_domain_records`: 0
- `google_ads_sync_cursors`: 0
- `google_ads_sync_locks`: 0

### Notes on requested table names

Requested: `google_ads_accounts`, `sync_runs`, `checkpoints`, `metadata`.

Actual schema names in this backend are:

- `google_ads_customer_accounts` (accounts)
- `google_ads_sync_runs` (sync runs)
- `google_ads_sync_checkpoints` (checkpoints)
- Connection metadata is stored inside `google_oauth_connections.metadata` JSON field and is removed when the connection row is deleted.
