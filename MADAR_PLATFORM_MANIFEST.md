# MADAR Platform Manifest

## Preamble

MADAR is the operating system for Marketing Intelligence.

This manifest defines the non-negotiable engineering principles of the platform.
It is not a design document, not an implementation guide, and not a migration plan.

After this manifest is approved, architecture is frozen.
Implementation may then begin, but only within the bounds defined here.

## Constitutional Principles

1. Backend is the only source of truth.
2. n8n is an interchangeable execution engine.
3. No workflow engine owns business entities.
4. No workflow engine writes directly to PostgreSQL.
5. All persistence happens through backend commands and events.
6. Every external provider is a plugin.
7. Every connector follows the same lifecycle.
8. Every workflow is versioned.
9. Every event is versioned.
10. Every command is idempotent.
11. Every execution is observable.
12. Every connector is replaceable.
13. AI is never allowed to bypass domain rules.
14. AI can only produce commands and consume events.
15. Every component is multi-tenant.
16. Every plugin is sandboxed.
17. Every plugin is signed.
18. Every plugin declares capabilities.
19. Every plugin declares compatibility.
20. No vendor lock-in is allowed.

## Platform Identity

MADAR is not a SaaS application.
It is a multi-tenant integration and intelligence platform.

The platform must support:

- connector ecosystems
- workflow execution
- event-driven automation
- AI-assisted operations
- analytics and observability
- public APIs and developer surfaces
- plugin distribution and governance

The platform must remain coherent as it expands to many providers, many execution engines, many regions, and many years of evolution.

## Required Platform Layers

The platform is organized into layers that are ordered by dependency:

1. Presentation
2. Experience
3. API
4. Application
5. Domain
6. Infrastructure
7. Integration
8. Workflow
9. Automation
10. AI
11. Analytics
12. Storage
13. Observability

### Layer rules

- Upper layers may depend on lower layers.
- Lower layers may not depend on upper layers.
- Business truth lives in the domain and application layers, not in UI, workflow engines, or plugins.
- Execution engines are infrastructure concerns, not domain owners.

## Foundation Services

Every module depends on a small set of platform foundation services:

- Identity Service
- Organization Service
- Workspace Service
- Project Service
- Feature Flag Service
- Audit Service
- Notification Service
- Secrets Service
- Configuration Service
- Workflow Service
- Queue Service
- Storage Service
- Scheduling Service
- Search Service
- Event Bus
- Metrics Service
- Logging Service
- Health Service
- Plugin Registry
- Connector Registry
- SDK Registry

### Foundation service rule

No foundation service may silently own business logic outside its boundary.
Each service must have a clearly defined domain responsibility and an explicit contract.

## Execution Abstraction

The backend must never depend directly on n8n.

The platform defines a generic Execution Engine contract.

Possible engine implementations include:

- n8n
- Temporal
- Azure Durable Functions
- AWS Step Functions
- Local Executor
- future engines

### Execution engine rules

- The engine executes work.
- The backend defines what work exists.
- The backend defines authorization, tenancy, idempotency, workflow versioning, and persisted state.
- Replacing one execution engine must not require redesigning the backend.

## Connector Rules

Every external provider is a plugin.
Every connector follows the same lifecycle.

### Standard connector lifecycle

1. Register
2. Install
3. Authorize
4. Configure
5. Validate
6. Execute initial workflow
7. Execute incremental or scheduled workflows
8. Monitor health
9. Rotate credentials
10. Disconnect
11. Remove

### Connector invariants

- Connectors are replaceable.
- Connectors must not redefine platform behavior.
- Connectors must not special-case platform business rules.
- Connectors may differ in transport, but not in lifecycle ownership.

## Capability Registry

The platform uses a generic capability model.

Capabilities are declared, not inferred by hardcoded branching.

### Capability examples

- SYNC
- IMPORT
- EXPORT
- READ
- WRITE
- DELETE
- SEARCH
- WEBHOOK
- REALTIME
- AI
- AUTOMATION
- REPORTING
- ANALYTICS

### Capability rules

- Every connector advertises capabilities.
- The platform does not special-case Google Ads or any other provider.
- Capabilities control discovery, UI, workflows, entitlement, and compatibility.

## Metadata Registry

The platform maintains a metadata registry for every connector.

Each connector must describe:

- objects
- fields
- relationships
- metrics
- dimensions
- supported operations

### Metadata registry rule

Capabilities and metadata must be discoverable from the registry rather than hardcoded in product logic.

The registry is the contract between the platform and connector implementations.

## Connector Manifest

Every connector must ship with a manifest.

The manifest defines:

- connector id
- version
- sdk version
- provider
- oauth requirements
- scopes
- capabilities
- supported objects
- workflow definitions
- events
- health checks
- compatibility
- minimum platform version

### Manifest rules

- A connector without a manifest is not installable.
- A connector manifest is versioned and signed.
- Compatibility must be checked before activation.

## Plugin Trust Model

Every plugin must support:

- digital signature
- publisher identity
- permissions
- capability declaration
- compatibility validation
- isolation
- lifecycle validation

### Trust model rules

- Only trusted publishers may distribute production-grade plugins.
- The platform must validate signatures before installation.
- The plugin runtime must be isolated from platform core state.
- Plugin permissions must be explicit and least-privilege.

## Event Taxonomy

Events are categorized and must never be mixed casually.

### Event categories

- Domain Events
- Integration Events
- Workflow Events
- Automation Events
- Audit Events
- Telemetry Events

### Event rules

- Every event type is versioned.
- Every event has a defined owner.
- Events are immutable after publication.
- Events must carry tenant context and correlation metadata.

### Event ownership rule

- Domain Events describe business facts.
- Integration Events describe connector and provider interaction.
- Workflow Events describe execution lifecycle.
- Automation Events describe policy-triggered responses.
- Audit Events describe compliance and traceability.
- Telemetry Events describe operational signals.

## Persistence Rule

All persistence happens through backend commands and events.

### Implications

- n8n and plugins may request work, but they do not own persistence.
- Direct database writes from workflow engines are prohibited.
- Backend commands are the only sanctioned mutation path.

### Persistence invariants

- Multi-tenant scoping is mandatory.
- Writes must be idempotent where retries are possible.
- State transitions must be auditable.

## AI Platform Rules

AI is allowed to assist; it is not allowed to govern.

### AI may

- produce commands
- consume events
- summarize system state
- recommend actions
- request workflows through platform contracts

### AI may not

- bypass authorization
- bypass domain rules
- write directly to storage
- invent entities
- act outside the command and event model

### AI safety rule

AI must be constrained by the same policies, permissions, and tenant boundaries as human users and service actors.

## Multi-Tenancy Rules

Every component is multi-tenant.

### Tenant hierarchy

- Organization
- Workspace
- Project

### Tenant rules

- No global mutable business state.
- No tenant-agnostic workflows unless explicitly platform-scoped.
- Every command, event, workflow run, job, and plugin action must carry tenant context.
- Read models must remain tenant-aware.

## Observability Rules

Every execution is observable.

### Observable units

- every command
- every workflow
- every event
- every sync
- every connector
- every job

### Observability requirements

- Structured logs
- Metrics
- Traces
- Correlation ids
- Execution ids
- Health states

### Observability rule

Observability must be built into the platform contract, not added later as a side effect.

## Security Rules

### Required security principles

- least privilege
- secret isolation
- encryption at rest and in transit
- signed plugins
- validated compatibility
- explicit tenant authorization
- replay protection for webhooks and workflows

### Security rule

Security controls must be enforced by platform policy, not by connector convention.

## Workflow Principles

### Every workflow is versioned

- Workflow definitions are immutable once published.
- Workflow runs reference the exact workflow version they executed.
- Workflow versions must remain backward-compatible or be explicitly retired.

### Workflow ownership rule

- Workflows describe execution.
- They do not own business truth.
- They do not replace commands, events, or domain rules.

## Vendor Independence

No vendor lock-in is allowed.

### Required independence

- The backend must not depend on a single execution engine.
- The platform must not depend on a single connector transport model.
- The plugin system must not depend on a single marketplace or deployment model.
- Workflow and event contracts must remain portable across engines and infrastructure providers.

## Developer Experience Principles

The platform must be understandable and extensible by third-party developers.

### DX rules

- A new connector should not require backend business logic changes.
- A connector developer should implement the manifest and SDK contract, not patch core services.
- Public contracts must be discoverable and versioned.
- Failure modes must be explicit and debuggable.

## Implementation Readiness Criteria

Before implementation begins, the architecture must satisfy:

- Scalability
- Security
- Extensibility
- Developer Experience
- Performance
- Testability
- Maintainability
- Replaceability
- Vendor Independence
- Operational Simplicity

### Readiness rule

If any of the above cannot be achieved without violating the manifest principles, the design is not ready for implementation.

## Governance Rule

This manifest is the final architectural authority.

Any future change that conflicts with this document requires explicit architectural review.

No team may bypass these principles for speed, convenience, or provider-specific pressure.

## Final Statement

MADAR is a platform, not a project.

It must scale for the next ten years without becoming dependent on one workflow engine, one provider model, one tenant workaround, or one hidden execution path.

Design once.
Scale forever.
