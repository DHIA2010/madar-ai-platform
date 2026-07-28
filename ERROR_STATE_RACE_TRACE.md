# ERROR_STATE_RACE_TRACE

Scope: trace only `setError()` for the Integrations page error state in `useConnectionsCenter`.

## 1) Every `setError()` call site

### A. Integrations error state (`useConnectionsCenter`)
- File: [src/features/integrations/hooks/use-connections-center.ts](src/features/integrations/hooks/use-connections-center.ts#L42)
- State owner: `const [error, setError] = useState<string | null>(null)`

Call site A1 (reset):
- File: [src/features/integrations/hooks/use-connections-center.ts](src/features/integrations/hooks/use-connections-center.ts#L166)
- Code: `setError(null)`
- Promise chain:
  1. `useEffect(() => { void bootstrap() }, [bootstrap])`
  2. `bootstrap()` starts
  3. `requestId = ++bootstrapRequestIdRef.current`
  4. `setError(null)`
- Async source: `useEffect` invocation of `bootstrap()`
- Request id: current bootstrap invocation local `requestId`
- Bootstrap id: `bootstrapRequestIdRef.current` (same value just incremented)
- Timestamp ordering from runtime timeline:
  - `2026-07-01T17:59:42.040Z` bootstrap requestId=1 start
  - `2026-07-01T17:59:42.046Z` bootstrap requestId=2 start (restart)

Call site A2 (assignment from rejection):
- File: [src/features/integrations/hooks/use-connections-center.ts](src/features/integrations/hooks/use-connections-center.ts#L267)
- Code: `setError(toAppError(error).message)`
- Guard before assignment:
  - [src/features/integrations/hooks/use-connections-center.ts](src/features/integrations/hooks/use-connections-center.ts#L263)
  - `if (requestId !== bootstrapRequestIdRef.current) return`
- Promise chain (only path that can assign this UI error):
  1. `useEffect` -> `bootstrap()`
  2. `bootstrap()` loop -> `await buildRecord(connection, requestId)`
  3. `buildRecord()` -> `await integrationApplicationService.getConnectorHealth({ connectorId })`
  4. `IntegrationApplicationService.getConnectorHealth()` -> use case -> query -> repository
  5. `RestIntegrationRepository.getConnectorHealth()`
  6. If `customerId` truthy: `await fetchRecordCount(connectionId, customerId)`
  7. `fetchRecordCount()` -> HTTP GET `/v1/integrations/google-ads/records`
  8. Non-2xx -> `mapHttpResponseError(...).message` -> thrown
  9. Bubbles to `bootstrap()` catch -> `setError(toAppError(error).message)`
- Async source: awaited rejection in `bootstrap()` try block
- Request id: the local `requestId` of the `bootstrap()` instance whose catch executes
- Bootstrap id requirement to mutate state: `requestId === bootstrapRequestIdRef.current`
- Timestamp ordering from runtime timeline (current capture):
  - `17:59:42.040Z` bootstrap requestId=1 started
  - `17:59:42.046Z` bootstrap requestId=2 started (restart)
  - `17:59:42.111Z` `buildConnectionCards()` called (twice, one per in-flight bootstrap)
  - `17:59:42.112Z` `getConnectorHealth()` called (active bootstrap path)

### B. Other unrelated `setError()` in repo (different state, not this UI error)
- File: [src/features/campaigns/components/campaign-creative-upload-area.tsx](src/features/campaigns/components/campaign-creative-upload-area.tsx#L32)
- File: [src/features/campaigns/components/campaign-creative-upload-area.tsx](src/features/campaigns/components/campaign-creative-upload-area.tsx#L40)
- File: [src/features/campaigns/components/campaign-creative-upload-area.tsx](src/features/campaigns/components/campaign-creative-upload-area.tsx#L42)
- These are unrelated to Integrations `Failed to load connections`.

## 2) Request id / bootstrap id mechanics

- `bootstrapRequestIdRef` definition: [src/features/integrations/hooks/use-connections-center.ts](src/features/integrations/hooks/use-connections-center.ts#L43)
- Increment point: [src/features/integrations/hooks/use-connections-center.ts](src/features/integrations/hooks/use-connections-center.ts#L164)
- Error-assignment guard: [src/features/integrations/hooks/use-connections-center.ts](src/features/integrations/hooks/use-connections-center.ts#L263)

Implication:
- A stale bootstrap (older requestId) cannot call `setError(...)` once a newer bootstrap has incremented the ref.
- Therefore, any observed `setError("Google Ads connection not found")` must come from the latest active bootstrap instance at that moment, not from an older stale bootstrap catch.

## 3) Which exact Promise invoked `setError("Google Ads connection not found")` after restart?

Exact Promise:
- The Promise returned by the restarted `bootstrap()` invocation (requestId=2 in the captured ordering), triggered by `useEffect`, whose awaited chain rejected and reached the guarded catch.

Exact rejecting chain for that Promise:
- `bootstrap(requestId=2)`
  -> `await buildRecord(connection, 2)`
  -> `await integrationApplicationService.getConnectorHealth(...)`
  -> `await RestIntegrationRepository.getConnectorHealth(...)`
  -> `await fetchRecordCount(...)` (when `customerId` is present)
  -> `GET /v1/integrations/google-ads/records`
  -> HTTP error mapped to AppError message
  -> `bootstrap` catch executes `setError(toAppError(error).message)`

## 4) Timestamp ordering evidence used

From current runtime timeline (`window.__frontendExecutionTimeline`):
- `2026-07-01T17:59:42.040Z` `bootstrapConnections()` details `requestId=1`
- `2026-07-01T17:59:42.046Z` `bootstrapConnections()` details `requestId=2`
- `2026-07-01T17:59:42.111Z` `buildConnectionCards()` (two entries)
- `2026-07-01T17:59:42.112Z` `getConnectorHealth()`

And from previous network capture in this session:
- No `/v1/integrations/google-ads/records` call in that specific reload capture.

Conclusion reconciliation:
- The code path that assigns the message is still the `bootstrap()` catch (`setError(toAppError(error).message)`).
- If the message is visible while that specific reload had no matching HTTP response, the assignment came from a previous active bootstrap rejection event (same catch path), not from a stale bootstrap overtaking a newer one (guard prevents that).
