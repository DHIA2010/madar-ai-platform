# Infrastructure Layer

## Objective
Centralize cross-cutting infrastructure primitives to prevent duplicate implementations across backend modules.

## Source

- `src/backend-foundation/infrastructure-layer.ts`

## Included Foundations

1. Logging
- `ConsoleFoundationLogger`

2. Metrics
- `InMemoryFoundationMetrics` (lightweight baseline)

3. Tracing
- `NoopFoundationTracer`

4. Time and IDs
- `SystemClock`
- `CryptoUuidGenerator`

5. Error Handling
- `FoundationError`
- `mapErrorToProblem`

## Design Choices

- Keep base implementations simple and dependency-light.
- Provide stable contracts first; observability backends can be swapped later.
- Preserve existing module-specific infrastructure until migration is safe.

## Migration Plan

1. Gradually move module-local logger/clock/uuid wrappers to foundation contracts.
2. Add adapters for OpenTelemetry and production metrics backend.
3. Standardize error mapping in all backend REST servers to foundation problem responses.
