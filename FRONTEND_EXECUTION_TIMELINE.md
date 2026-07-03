# Frontend Execution Timeline

## Scope
Frontend-only instrumentation was added to capture these steps:
1. fetchConnections()
2. bootstrapConnections()
3. buildConnectionCards()
4. getConnectorHealth()
5. getRecords()
6. deleteConnection()
7. invalidateQueries()
8. refetchConnections()

Reproduction run used one seeded Google Ads connection (`conn_trace_002`) and then deleted it from Connection Details.

## Raw Timeline

### Event 1
- step: `bootstrapConnections()`
- timestamp: `2026-07-01T17:36:48.796Z`
- connectionId: `null`
- customerId: `null`
- connection count: `0`
- details: `requestId=1`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:536:196)`
  3. `at useConnectionsCenter.useEffect (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:628:18)`
  4. `at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:14876:22)`
  5. `at runWithFiberInDEV (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:965:74)`

### Event 2
- step: `fetchConnections()`
- timestamp: `2026-07-01T17:36:48.797Z`
- connectionId: `null`
- customerId: `null`
- connection count: `1`
- details: `loaded stored connection references`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:547:200)`
  3. `at useConnectionsCenter.useEffect (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:628:18)`
  4. `at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:14876:22)`
  5. `at runWithFiberInDEV (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:965:74)`

### Event 3
- step: `bootstrapConnections()`
- timestamp: `2026-07-01T17:36:48.806Z`
- connectionId: `null`
- customerId: `null`
- connection count: `0`
- details: `requestId=2`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:536:196)`
  3. `at useConnectionsCenter.useEffect (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:628:18)`
  4. `at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:14876:22)`
  5. `at runWithFiberInDEV (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:965:74)`

### Event 4
- step: `fetchConnections()`
- timestamp: `2026-07-01T17:36:48.809Z`
- connectionId: `null`
- customerId: `null`
- connection count: `1`
- details: `loaded stored connection references`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:547:200)`
  3. `at useConnectionsCenter.useEffect (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:628:18)`
  4. `at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:14876:22)`
  5. `at runWithFiberInDEV (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:965:74)`

### Event 5
- step: `buildConnectionCards()`
- timestamp: `2026-07-01T17:36:48.817Z`
- connectionId: `conn_trace_002`
- customerId: `123-456-7890`
- connection count: `0`
- details: ``
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[buildRecord] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:454:196)`
  3. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:600:42)`

### Event 6
- step: `buildConnectionCards()`
- timestamp: `2026-07-01T17:36:48.817Z`
- connectionId: `conn_trace_002`
- customerId: `123-456-7890`
- connection count: `0`
- details: ``
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[buildRecord] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:454:196)`
  3. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:600:42)`

### Event 7
- step: `getConnectorHealth()`
- timestamp: `2026-07-01T17:36:48.818Z`
- connectionId: `null`
- customerId: `null`
- connection count: `1`
- details: `connectorId=google_ads`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at RestIntegrationRepository.getConnectorHealth (http://localhost:3000/_next/static/chunks/src_infrastructure_20ff9766._.js:5036:196)`
  3. `at GetConnectorHealthQuery.execute (http://localhost:3000/_next/static/chunks/src_application_20cd414e._.js:319:29)`
  4. `at GetConnectorHealthUseCase.execute (http://localhost:3000/_next/static/chunks/src_application_20cd414e._.js:2989:41)`
  5. `at IntegrationApplicationService.getConnectorHealth (http://localhost:3000/_next/static/chunks/src_application_20cd414e._.js:5202:47)`

### Event 8
- step: `getRecords()`
- timestamp: `2026-07-01T17:36:48.818Z`
- connectionId: `conn_trace_002`
- customerId: `123-456-7890`
- connection count: `1`
- details: ``
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at RestIntegrationRepository.fetchRecordCount (http://localhost:3000/_next/static/chunks/src_infrastructure_20ff9766._.js:4708:192)`
  3. `at RestIntegrationRepository.getConnectorHealth (http://localhost:3000/_next/static/chunks/src_infrastructure_20ff9766._.js:5061:38)`
  4. `at GetConnectorHealthQuery.execute (http://localhost:3000/_next/static/chunks/src_application_20cd414e._.js:319:29)`
  5. `at GetConnectorHealthUseCase.execute (http://localhost:3000/_next/static/chunks/src_application_20cd414e._.js:2989:41)`

### Event 9
- step: `deleteConnection()`
- timestamp: `2026-07-01T17:37:05.878Z`
- connectionId: `conn_trace_002`
- customerId: `123-456-7890`
- connection count: `1`
- details: ``
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[deleteConnection] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:716:196)`
  3. `at onDeleteConnection (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:1008:19)`
  4. `at onConfirm (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:1615:30)`
  5. `at executeDispatch (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:10314:13)`

### Event 10
- step: `invalidateQueries()`
- timestamp: `2026-07-01T17:37:05.904Z`
- connectionId: `conn_trace_002`
- customerId: `123-456-7890`
- connection count: `0`
- details: `No React Query invalidation in Connections Center; local state/storage invalidation only`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[deleteConnection] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:740:196)`
  3. `at async onDeleteConnection (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:1008:13)`

### Event 11
- step: `refetchConnections()`
- timestamp: `2026-07-01T17:37:05.904Z`
- connectionId: `conn_trace_002`
- customerId: `123-456-7890`
- connection count: `0`
- details: ``
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[deleteConnection] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:747:196)`
  3. `at async onDeleteConnection (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:1008:13)`

### Event 12
- step: `bootstrapConnections()`
- timestamp: `2026-07-01T17:37:05.905Z`
- connectionId: `null`
- customerId: `null`
- connection count: `0`
- details: `requestId=4`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:536:196)`
  3. `at useConnectionsCenter.useCallback[deleteConnection] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:753:19)`
  4. `at async onDeleteConnection (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:1008:13)`

### Event 13
- step: `fetchConnections()`
- timestamp: `2026-07-01T17:37:05.905Z`
- connectionId: `null`
- customerId: `null`
- connection count: `0`
- details: `loaded stored connection references`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:547:200)`
  3. `at useConnectionsCenter.useCallback[deleteConnection] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:753:19)`
  4. `at async onDeleteConnection (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:1008:13)`

### Event 14
- step: `bootstrapConnections()`
- timestamp: `2026-07-01T17:37:05.989Z`
- connectionId: `null`
- customerId: `null`
- connection count: `0`
- details: `requestId=1`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:536:196)`
  3. `at useConnectionsCenter.useEffect (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:628:18)`
  4. `at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:14876:22)`
  5. `at runWithFiberInDEV (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:965:74)`

### Event 15
- step: `fetchConnections()`
- timestamp: `2026-07-01T17:37:05.990Z`
- connectionId: `null`
- customerId: `null`
- connection count: `0`
- details: `loaded stored connection references`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:547:200)`
  3. `at useConnectionsCenter.useEffect (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:628:18)`
  4. `at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:14876:22)`
  5. `at runWithFiberInDEV (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:965:74)`

### Event 16
- step: `bootstrapConnections()`
- timestamp: `2026-07-01T17:37:05.993Z`
- connectionId: `null`
- customerId: `null`
- connection count: `0`
- details: `requestId=2`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:536:196)`
  3. `at useConnectionsCenter.useEffect (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:628:18)`
  4. `at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:14876:22)`
  5. `at runWithFiberInDEV (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:965:74)`

### Event 17
- step: `fetchConnections()`
- timestamp: `2026-07-01T17:37:05.994Z`
- connectionId: `null`
- customerId: `null`
- connection count: `0`
- details: `loaded stored connection references`
- stack (top 5):
  1. `at traceFrontendExecution (http://localhost:3000/_next/static/chunks/src_21d06df5._.js:255:20)`
  2. `at useConnectionsCenter.useCallback[bootstrap] (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:547:200)`
  3. `at useConnectionsCenter.useEffect (http://localhost:3000/_next/static/chunks/src_1cd97f06._.js:628:18)`
  4. `at Object.react_stack_bottom_frame (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:14876:22)`
  5. `at runWithFiberInDEV (http://localhost:3000/_next/static/chunks/node_modules_next_dist_compiled_react-dom_1e674e59._.js:965:74)`

## Answers

### Q1. After fetchConnections() returns zero rows, why is getConnectorHealth() still called?
`getConnectorHealth()` is not called by the post-delete zero-row fetch in this run. It is called by an earlier in-flight bootstrap path that already captured one stored reference (`fetchConnections()` events 2 and 4 with connection count `1`) and entered `buildConnectionCards()` before the zero-row state was finalized.

### Q2. Which function invokes it?
`useConnectionsCenter` -> `buildRecord()` invokes `integrationApplicationService.getConnectorHealth()`, which resolves to `RestIntegrationRepository.getConnectorHealth()`.

### Q3. Which state variable still contains the deleted connection?
At the end of the delete run, none persisted:
- `connections-center:v1` is empty (`[]`)
- `connections-center:connector-accounts:v1` is empty (`{}`)
- `integration-runtime-state:v1.connections` is empty (`[]` keys)

The stale value exists in async in-flight closure data for bootstrap/build (`storedRef`/`connection` captured before invalidation), not in final persisted state.

### Q4. Is it React Query cache, Context, localStorage, URL params, bootstrap promise, async race, or something else?
`bootstrap promise` + `async race`.

This trace does not show React Query cache invalidation activity for this feature path. Instrumented `invalidateQueries()` event confirms local state/storage invalidation only.

### Q5. Which single function should stop executing when connection count == 0?
`buildRecord()` (the `buildConnectionCards()` step) should not continue into `getConnectorHealth()` when effective connection count is zero or the bootstrap request is stale.
