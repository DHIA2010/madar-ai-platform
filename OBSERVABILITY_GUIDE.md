# OBSERVABILITY_GUIDE

## Implemented Foundation
- Structured logger adapter
- Request context with `requestId` and `correlationId`
- Liveness endpoint: `/live`
- Health endpoint: `/health`
- Readiness endpoint: `/ready`
- Audit log append model
- Error category mapping
- OpenTelemetry package hook readiness
- Metrics provider abstraction
- Outbox-backed audit/event publication readiness

## Request Context
Each request context now carries:
- `requestId`
- `correlationId`
- `ipAddress`
- `userAgent`

## Audit Model
Audit events are written from the application layer so sensitive activity is captured independently from HTTP adapter details.

## Hooks Ready For Expansion
- Metrics instrumentation at REST middleware or handler boundaries
- Distributed tracing span creation from request context
- External log aggregation through logger adapter replacement
- Queue-backed audit/event fan-out through event publisher replacement

## Current Gap
Metrics and tracing are hook-ready, not fully implemented. The architecture supports them, but the default adapters are still minimal.

## Runtime Behavior
- `/live` proves process liveness.
- `/health` reports a composite health view.
- `/ready` reports infrastructure readiness and returns `503` when required infrastructure is unavailable.

