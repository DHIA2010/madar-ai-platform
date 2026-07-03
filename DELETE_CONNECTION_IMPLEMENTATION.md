# DELETE_CONNECTION_IMPLEMENTATION

## Summary
Implemented a permanent production-grade Delete Connection feature for Connections Center.

- Backend endpoint added: `DELETE /v1/integrations/:connectionId`
- Authorization and tenant safety checks enforced.
- Transactional cascade delete implemented for connection and related OAuth/sync metadata.
- Frontend delete actions added in both required locations.
- Confirmation dialog and loading protections added.
- Success/error toasts and UI state updates implemented.
- Tests added across repository, service, REST API, and frontend integration.

## API Endpoint
### Route
- `DELETE /v1/integrations/:connectionId`

### Behavior
- Requires authenticated actor.
- Requires actor role to include `owner` or `admin`.
- Validates the connection:
  - exists,
  - belongs to actor organization,
  - belongs to actor current workspace (when actor has active workspace).
- Executes delete as a single transaction.
- Returns `204 No Content` on success.

### Error model
- `404` when connection is not found or outside actor scope.
- `403` when actor lacks required role.
- `401` when auth token missing/invalid (existing auth middleware behavior).

## Database Cascade Behavior
Deletion is explicit and ordered inside one transaction (service + repository), then removes the root connection row.

Tables deleted by `connection_id`:
- `google_ads_sync_cursors`
- `google_ads_sync_checkpoints`
- `google_ads_sync_locks`
- `google_ads_domain_records`
- `google_ads_sync_runs`
- `google_ads_customer_accounts` (accessible customer accounts)
- `google_oauth_events`
- `google_oauth_states`
- `google_oauth_connections` (connection record)

Related metadata cleanup:
- `audit_logs` where `entity_type = 'google_oauth_connection'` and `entity_id = connectionId`
- `outbox_events` where `aggregate_type = 'google_oauth_connection'` and `aggregate_id = connectionId`

## Frontend UX and Flow
### Added delete action locations
1. Connections Overview card overflow menu (three dots):
- `Delete Connection`

2. Connection Details page:
- `Delete Connection` destructive button

### Confirmation dialog
Title:
- `Delete Connection`

Body:
- `This will permanently remove the connection, OAuth tokens, synced metadata, and history.`
- `This action cannot be undone.`

Buttons:
- `Cancel`
- `Delete`

### Success behavior
- Calls backend delete endpoint.
- Removes connection from in-memory UI list and local stored references.
- On details page, redirects to `/integrations`.
- Shows success toast:
  - `Connection deleted successfully.`

### Failure behavior
- Shows backend error message via error toast.

### UX safety controls
- Confirm action required before deletion.
- Delete confirm button shows loading state while in-flight.
- Double-submit prevented by loading guard.
- Dialog close is blocked while delete request is running.

## UI Screenshots / Flow
No screenshots were captured in this implementation document.

Flow covered:
1. Open connection actions.
2. Choose `Delete Connection`.
3. Confirm in destructive dialog.
4. Observe success toast and updated UI (or redirect from details page).

## Test Coverage
### Repository tests
- `src/identity-platform/tests/google-oauth.repository-contract.test.ts`
  - Added test verifying cascade deletion removes connection and related tables.

### Service tests
- `src/identity-platform/tests/google-oauth.connection-deletion.service.test.ts`
  - Added tests for:
    - successful delete by authorized owner,
    - forbidden for non-admin/non-owner,
    - workspace boundary protection.

### REST API tests
- `src/identity-platform/tests/google-oauth.http.test.ts`
  - Added `DELETE /v1/integrations/:connectionId` test asserting:
    - `204` response,
    - connection and account records removed.

### Frontend integration tests
- `src/features/integrations/components/connection-details.test.tsx`
  - Added delete-confirm flow test asserting:
    - delete call,
    - success toast,
    - redirect to overview.

- `src/features/integrations/components/connections-overview.test.tsx`
  - Updated for delete-capable hook contract and overview render stability.

## Manual Verification Checklist
1. Start backend and frontend.
2. Ensure at least one connection exists in Connections Center.
3. From Connections Overview card menu, click `Delete Connection`.
4. Verify confirmation dialog content and destructive action labels.
5. Click `Cancel` and verify no deletion occurs.
6. Re-open dialog, click `Delete`.
7. Verify button loading state prevents duplicate submission.
8. Verify success toast: `Connection deleted successfully.`
9. Verify deleted connection no longer appears in Connections Overview.
10. Open a connection details page and delete from details action.
11. Verify redirect back to `/integrations` after success.
12. Verify backend DB tables no longer contain rows for that `connection_id`.
13. Attempt delete with user lacking `owner/admin` and verify access denied.
14. Attempt delete for another workspace/org connection and verify not found/denied behavior.
