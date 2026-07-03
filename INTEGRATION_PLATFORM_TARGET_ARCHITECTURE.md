# INTEGRATION_PLATFORM_TARGET_ARCHITECTURE

## Objective
Turn MADAR into a connector-based integration platform where the backend remains the business system of record and n8n becomes the generic execution engine for external workflows.

Google Ads is the first connector, not a special case.

## Core Principle

The platform must separate ownership clearly:

- Backend owns entities, permissions, identity, metadata, auditability, and user-facing APIs.
- n8n owns execution of external workflows, retries, pagination, scheduling, and provider-side orchestration.
- Neither side should duplicate the other’s responsibilities.

## Current State Summary

The codebase already has the beginnings of a connector framework:

- [src/application/contracts/integration.contracts.ts](src/application/contracts/integration.contracts.ts) defines reusable lifecycle and sync contracts.
- [src/application/services/integration-application.service.ts](src/application/services/integration-application.service.ts) already exposes a generic application façade.
- [src/infrastructure/data/repositories/integration.repository.ts](src/infrastructure/data/repositories/integration.repository.ts) currently acts as a frontend-facing integration gateway and still contains Google Ads-specific behavior.
- [src/integration-platform/interfaces/openapi/integration-openapi-spec.ts](src/integration-platform/interfaces/openapi/integration-openapi-spec.ts) is the best place to formalize generic integration APIs.

The main issue is that workflow execution is still too close to the repository and too coupled to Google Ads.

## Target Architecture

### Backend responsibilities

The backend remains the source of truth for:

- Authentication and authorization
- Organizations, workspaces, projects, users
- OAuth lifecycle and credential persistence
- Connection lifecycle and status
- Connection metadata and connector configuration
- Feature flags and permissions
- Audit logs and billing events
- Dashboard APIs and read models
- AI orchestration and platform control plane
- Workflow registration, versioning, and execution tracking

### n8n responsibilities

n8n becomes the execution plane for all external integrations:

- Initial sync
- Re-sync
- Scheduled sync
- Incremental sync
- Historical backfill
- Pagination
- Retry handling
- Rate limiting
- Provider API invocation
- Normalization and transformation
- Operational logging
- Notifications and alerts

n8n should not own business logic, tenancy rules, billing, or permission decisions.

## Connector Lifecycle

Every connector should follow the same lifecycle:

1. Connection created in backend
2. OAuth completed in backend
3. Connector configuration persisted in backend
4. Backend triggers a versioned n8n workflow
5. n8n executes provider workflow and writes normalized output
6. Backend receives execution events and updates state
7. Dashboard reads status from backend
8. Disconnect/revoke handled by backend, with workflow cancellation propagated to n8n

## Recommended Boundary

### Backend should expose generic contracts

The backend should expose a small set of connector-neutral contracts:

- `ConnectorDefinition`
- `Connection`
- `WorkflowDefinition`
- `WorkflowRun`
- `ConnectorHealth`
- `ExecutionEvent`
- `WebhookEnvelope`
- `SyncCheckpoint`
- `IdempotencyKey`

### n8n should receive only execution input

n8n should accept a generic execution payload such as:

- connection id
- connector definition id
- workflow type
- workflow version
- idempotency key
- checkpoint or cursor
- execution metadata
- correlation ids

n8n should not decide authorization, workspace access, or connector entitlement.

## What Should Be Reused

These are reusable and should be preserved or adapted:

- Connector contract and lifecycle abstractions in [src/application/contracts/integration.contracts.ts](src/application/contracts/integration.contracts.ts)
- Existing connector-specific implementations under [src/infrastructure/integration/](src/infrastructure/integration/)
- OAuth and connection persistence in [src/identity-platform/](src/identity-platform/)
- Existing connection, job, run, and health models
- Integration dashboard and read-model flows

## What Is Obsolete or Needs Removal

These patterns should be phased out:

- Hardcoded Google Ads behavior in shared repositories
- Direct backend execution of provider workflows
- UI-owned sync execution state as a source of truth
- Connector-specific branching in shared application services
- Ad hoc endpoint shapes that are not connector-neutral

## Data Model Direction

The backend should evolve toward explicit entities for:

- `connector_definitions`
- `connections`
- `connector_credentials`
- `workflow_definitions`
- `workflow_runs`
- `workflow_events`
- `sync_checkpoints`
- `execution_outbox`
- `connector_health_snapshots`

This keeps business entities stable while allowing workflow versioning and execution history to scale independently.

## Execution Model

Use an event-driven and queue-backed model:

- Backend writes a workflow execution request.
- Backend stores an outbox event atomically with the state change.
- A dispatcher publishes the execution request to n8n or a queue.
- n8n executes the workflow and emits progress events.
- Backend stores those events and updates the workflow run state.
- Dashboard polls or subscribes to backend read models.

This avoids synchronous coupling and supports retries, idempotency, and high concurrency.

## Connector Registry

Introduce a connector registry in the backend control plane:

- Connector definitions are registered once.
- Capability metadata is centrally discoverable.
- Workflow versions are resolved by connector definition and workflow type.
- Google Ads becomes the reference implementation for the registry.

## n8n Integration Pattern

Use one generic n8n workflow template per workflow type, not per connector hack.

Example templates:

- `connector.initial_sync.v1`
- `connector.incremental_sync.v1`
- `connector.scheduled_sync.v1`
- `connector.webhook_ingest.v1`
- `connector.retry.v1`

Each workflow reads connector-specific parameters from the backend contract and delegates transformation into connector-specific subflows or configuration.

## Google Ads Reference Flow

Target flow:

Frontend -> Backend -> OAuth -> Persist encrypted credentials -> Trigger n8n workflow -> Google Ads API -> Normalize data -> Store in PostgreSQL -> Notify backend -> Update dashboard

Responsibilities in that flow:

- Backend handles OAuth, connection state, credential storage, workflow dispatch, and final status.
- n8n handles provider calls, pagination, retries, transformation, and execution logging.

## Migration Strategy

### Phase 1: Architecture Review

Deliverables:

- Inventory current connector lifecycle paths
- Identify shared abstractions that can stay
- Identify Google Ads-specific coupling in shared code
- Define the generic connector contracts and n8n boundary

Exit criteria:

- A documented target architecture and ownership split
- A clear list of reusable vs obsolete modules

### Phase 2: Migration Plan

Deliverables:

- Prioritized migration backlog
- Compatibility plan for existing integrations
- Risk register
- Rollback strategy for each migration slice

Exit criteria:

- Each step can be shipped without breaking the platform
- Google Ads remains functional throughout

### Phase 3: Implement n8n Infrastructure

Deliverables:

- n8n deployment and credentials management
- Execution contract between backend and n8n
- Queue/outbox dispatcher
- Execution event callback endpoint
- Workflow run persistence

Exit criteria:

- Backend can trigger a generic workflow
- n8n can report completion/failure back to backend

### Phase 4: Move Google Ads Workflow

Deliverables:

- Google Ads initial sync moved to n8n
- Incremental sync and scheduled sync moved to n8n
- Backend remains responsible for state, auth, and persistence
- Health and retry telemetry wired back to backend

Exit criteria:

- Google Ads sync runs entirely through the new execution model
- Existing dashboard and connection lifecycle continue working

### Phase 5: Production Readiness

Deliverables:

- Load and failure testing
- Idempotency validation
- Retry and backoff validation
- Observability and alerting
- Security review

Exit criteria:

- Stable operation under concurrent sync load
- Clear failure recovery with auditability

## First Engineering Changes I Would Make

1. Extract a connector registry and remove Google Ads conditionals from shared integration paths.
2. Introduce a workflow execution record in the backend.
3. Add an outbox-driven dispatcher for workflow requests.
4. Define a generic n8n workflow execution payload.
5. Move Google Ads sync execution behind that generic payload.

## Architecture Decision

The right long-term shape is a control-plane / execution-plane split:

- Backend = control plane
- n8n = execution plane

This is the simplest structure that scales to dozens or hundreds of connectors without turning the backend into a workflow engine.
