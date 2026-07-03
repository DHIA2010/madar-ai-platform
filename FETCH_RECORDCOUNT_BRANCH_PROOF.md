# FETCH_RECORDCOUNT_BRANCH_PROOF

Runtime proof target: `requestId=2` from `useConnectionsCenter.bootstrap()`.

## Evidence Snapshot

- `requestId=2` bootstrap start event:
  - step: `bootstrapConnections()`
  - timestamp: `2026-07-01T17:59:42.046Z`
  - details: `requestId=2`
- `buildConnectionCards()` event(s):
  - timestamp: `2026-07-01T17:59:42.111Z`
  - connectionId: `f27dc794-03d5-4925-aa38-52a0cb1f79bb`
  - customerId: `""`
- `getConnectorHealth()` event:
  - timestamp: `2026-07-01T17:59:42.112Z`
  - details: `connectorId=google_ads`
- `getRecords()` events in timeline: `[]` (none)

Source refs for branch condition:
- `customerId` assignment: [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L675)
- condition: [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L677)
- fetch call inside branch: [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts#L678)

## Requested Runtime Values (requestId=2)

| field | value |
|---|---|
| connectionId | `f27dc794-03d5-4925-aa38-52a0cb1f79bb` |
| connectorId | `google_ads` |
| customerId | `""` (empty string) |
| shouldFetchRecordCount | `false` (`Boolean(customerId)`) |
| branch taken | `NO` |
| exact condition that evaluated | `if (customerId)` |
| exact condition line number | `src/infrastructure/data/repositories/integration.repository.ts:677` |
| timestamp | `2026-07-01T17:59:42.112Z` (getConnectorHealth phase for requestId=2 flow) |

## Did `fetchRecordCount()` execute for requestId=2?

No.

Proof:
1. Runtime `customerId` for the requestId=2 connection is empty string (`""`).
2. Condition `if (customerId)` at line 677 evaluates false.
3. Timeline has no `getRecords()` step (the trace step emitted inside `fetchRecordCount()`).

## If not executed, which later function produced the error?

For this requestId=2 runtime sequence, no later function produced `setError("Google Ads connection not found")`.

What is proven in this capture:
- `setError(null)` occurs at bootstrap start: [src/features/integrations/hooks/use-connections-center.ts](src/features/integrations/hooks/use-connections-center.ts#L166)
- `fetchRecordCount()` branch is not taken.
- Therefore this requestId=2 chain does not produce that message.

Only code location that can assign the UI error state is:
- [src/features/integrations/hooks/use-connections-center.ts](src/features/integrations/hooks/use-connections-center.ts#L267)

In this proven requestId=2 snapshot, that assignment is not reached with `"Google Ads connection not found"`.
