# MADAR_PLATFORM_FOUNDATION

## Purpose

This document defines the platform foundation of MADAR.

It is not an application design.
It is the constitutional architecture for the MADAR platform.

All future modules, connectors, workflows, AI agents, and public APIs must conform to this foundation.

## Strategic Positioning

MADAR is the operating system for Marketing Intelligence.

It is not a single product surface, and it is not a collection of SaaS features.

MADAR is a platform that hosts:

- identity and tenant management
- connector ecosystems
- workflow execution
- automation and event-driven orchestration
- AI-assisted operations
- analytics and observability
- public APIs and developer surfaces
- plugin and marketplace distribution

## Core Platform Thesis

The platform is built on one central rule:

Every external capability is a plugin.

Every operation that changes platform state must pass through platform commands, policies, and events.

Every execution engine is subordinate to the platform domain.

No external system, including n8n, may own business entities or bypass platform rules.

## Design Principles

1. Platform before product.
2. Control plane before execution plane.
3. Domain ownership before workflow convenience.
4. Tenant isolation before shared efficiency.
5. Observability as a built-in property, not an add-on.
6. Versioned contracts before ad hoc integrations.
7. Public extensibility without public coupling.
8. AI must be constrained by the same domain rules as users.

## Layered Architecture

MADAR is organized into strictly ordered layers.

### 1. Presentation Layer

#### Purpose

The presentation layer exposes human interfaces.

#### Responsibilities

- Render dashboards, management screens, setup flows, and operational views
- Collect user intent
- Display platform state, metrics, and execution status
- Provide accessible and localized experiences

#### Constraints

- It must never contain business rules.
- It must never make authorization decisions.
- It must never own workflow state.

### 2. Experience Layer

#### Purpose

The experience layer shapes product journeys across UI, embedded surfaces, CLI, and public developer experiences.

#### Responsibilities

- Compose user journeys across multiple platform services
- Adapt platform concepts for different experiences
- Present workflow status, connector status, and organization context consistently

#### Constraints

- It may orchestrate calls, but it must not decide business policy.
- It must depend on application APIs, not infrastructure details.

### 3. API Layer

#### Purpose

The API layer exposes platform capabilities to internal and external consumers.

#### Responsibilities

- Public REST API
- Public GraphQL API
- Webhook ingestion API
- Admin APIs
- Connector and SDK APIs
- CLI and machine-facing API surfaces

#### Constraints

- APIs are contracts, not implementations.
- API handlers must delegate to application services.
- API versioning is mandatory for public surfaces.

### 4. Application Layer

#### Purpose

The application layer coordinates use cases.

#### Responsibilities

- Translate commands into domain actions
- Compose repositories, policies, and services
- Enforce transaction boundaries
- Manage orchestration across bounded contexts
- Publish events through the platform event model

#### Constraints

- It must not contain provider-specific execution logic.
- It must not own persistence schemas.
- It must not contain UI logic.

### 5. Domain Layer

#### Purpose

The domain layer defines business truth.

#### Responsibilities

- Model entities, aggregates, value objects, invariants, policies, and events
- Define the canonical platform language
- Preserve tenant ownership and state transitions

#### Constraints

- The domain must be infrastructure-agnostic.
- The domain must not depend on n8n, queues, databases, or vendor SDKs.

### 6. Infrastructure Layer

#### Purpose

The infrastructure layer implements ports.

#### Responsibilities

- Persistence
- External APIs
- Message queues
- Secrets storage
- Search
- Scheduling
- Observability sinks
- Plugin loading

#### Constraints

- Infrastructure is replaceable.
- Infrastructure must conform to domain and application interfaces.

### 7. Integration Layer

#### Purpose

The integration layer hosts connector implementations and connector adapters.

#### Responsibilities

- Connector registration
- Provider auth adapters
- Provider API adapters
- Webhook adapters
- Data normalization adapters
- Connector capability mapping

#### Constraints

- Connectors must not redefine platform rules.
- Connectors must not directly mutate platform state outside approved commands.

### 8. Workflow Layer

#### Purpose

The workflow layer defines versioned workflow contracts.

#### Responsibilities

- Workflow definitions
- Workflow versions
- Workflow triggers
- Workflow checkpoints
- Workflow run state

#### Constraints

- Workflows are contracts, not code paths hidden inside business services.
- Workflow execution must be replayable or resumable where required.

### 9. Automation Layer

#### Purpose

The automation layer reacts to domain events and business signals.

#### Responsibilities

- Event-driven rules
- Threshold-based triggers
- Conditional routing
- Notification orchestration
- AI-assisted automations

#### Constraints

- Automation consumes events.
- Automation must not hardcode provider behavior.
- Automation must operate on canonical MADAR events and models.

### 10. AI Layer

#### Purpose

The AI layer provides guided reasoning, recommendations, and agentic operations.

#### Responsibilities

- AI insights
- AI recommendations
- AI-driven workflow suggestions
- AI-assisted support and automation
- AI agent execution through platform commands

#### Constraints

- AI may suggest actions, but it may not bypass domain policies.
- AI must invoke the same commands and events as human users.
- AI must not write directly to domain stores.

### 11. Analytics Layer

#### Purpose

The analytics layer transforms platform events and connector output into insight.

#### Responsibilities

- Metrics
- Aggregations
- Trends
- Health scores
- Performance dashboards
- Revenue and usage reporting

#### Constraints

- Analytics is derived, not authoritative.
- Analytics must not be used as the source of truth for operational state.

### 12. Storage Layer

#### Purpose

The storage layer persists domain and operational data.

#### Responsibilities

- Relational persistence
- Object storage for artifacts and raw payloads
- Caches
- Search indexes
- Event streams and outboxes

#### Constraints

- Storage is a technical concern, not a domain owner.
- Data ownership follows bounded contexts.

### 13. Observability Layer

#### Purpose

The observability layer makes the platform legible and operable.

#### Responsibilities

- Traces
- Logs
- Metrics
- Alerts
- Execution visibility
- Tenant and connector diagnostics

#### Constraints

- Observability must be embedded into every command, workflow, job, and event.
- Observability must preserve tenant isolation and redact secrets.

## Foundation Services

Every module depends on a small set of platform foundation services.

### 1. Identity Service

Owns authentication, sessions, user identity, actor resolution, and security claims.

### 2. Organization Service

Owns organization lifecycle, membership, invitations, and tenant-level governance.

### 3. Workspace Service

Owns workspace lifecycle, membership, and workspace-level partitioning.

### 4. Project Service

Owns project boundaries and business-scoped execution contexts.

### 5. Feature Flag Service

Owns platform flags, rollout rules, audience targeting, and environment gating.

### 6. Audit Service

Owns immutable audit records, export, retention, and compliance trail generation.

### 7. Notification Service

Owns routing and delivery of operational and product notifications.

### 8. Secrets Service

Owns encrypted secret material, key management integration, rotation, and access auditing.

### 9. Configuration Service

Owns runtime configuration, environment overlays, platform settings, and validation.

### 10. Workflow Service

Owns workflow definitions, workflow versions, workflow run state, and orchestration metadata.

### 11. Queue Service

Owns asynchronous transport, leasing, retries, scheduling handoff, and dead-lettering.

### 12. Storage Service

Owns object storage, blob retention, raw payload archives, and workflow artifacts.

### 13. Scheduling Service

Owns cron schedules, delayed execution, time-zone rules, and recurring triggers.

### 14. Search Service

Owns indexed retrieval over connectors, connections, jobs, events, and artifacts.

### 15. Event Bus

Owns event publication, subscription, delivery, and outbox bridging.

### 16. Metrics Service

Owns counters, gauges, histograms, and business/operational metric emission.

### 17. Logging Service

Owns structured logs, correlation, redaction, and log routing.

### 18. Health Service

Owns readiness, liveness, health scoring, dependency checks, and degradation states.

### 19. Plugin Registry

Owns plugin discovery, trust levels, compatibility, and installation state.

### 20. Connector Registry

Owns connector definitions, capabilities, versions, and lifecycle metadata.

### 21. SDK Registry

Owns SDK versions, manifests, compatibility policies, and developer-facing contracts.

## Cross-Cutting Concerns

These concerns are not separate features. They are platform invariants.

### Authentication

- All user-facing operations require identity resolution.
- Machine-to-machine operations require scoped service credentials.
- Public surfaces must support future MFA and token-based flows.

### Authorization

- Authorization is tenant-scoped and context-aware.
- Every command must pass policy evaluation before mutation.
- AI and automation use the same authorization path as humans unless explicitly granted service privileges.

### Caching

- Caching is a performance optimization, never a source of truth.
- Cached values must obey tenant boundaries and invalidation rules.

### Rate Limiting

- Rate limits must exist per tenant, connector, workflow, and provider.
- Provider throttling must be independent from user API limits.

### Distributed Locking

- Locks are required for jobs, syncs, and contested state transitions.
- Locks are lease-based and recoverable.

### Idempotency

- Every externally visible mutation command must support idempotency keys where retryable.
- External execution must be deduplicated by execution id and correlation id.

### Retries

- Retries are policy-driven, bounded, and observable.
- Retry semantics differ for user commands, background jobs, and provider calls.

### Observability

- Every command, workflow, event, job, sync, and connector operation must emit traceable telemetry.

### Monitoring

- Monitoring must detect degraded connectors, queue buildup, failing automations, and billing anomalies.

### Tracing

- Trace context must propagate across frontend, backend, queue, workflow engine, and connector adapters.

### Structured Logging

- Logs must be structured, tenant-scoped, correlation-friendly, and secret-redacted.

### Secrets Management

- Secrets must be encrypted at rest.
- Secret access must be auditable.
- Secrets must never appear in logs, events, or analytics.

### Encryption

- Encryption is mandatory for tokens, credentials, webhook secrets, and high-risk payloads.

### Configuration

- Configuration must be typed, validated, and environment-aware.
- Configuration is a platform concern and must be centrally managed.

### Feature Flags

- Feature flags are required for safe rollout, connector gating, workflow migration, and tenant-targeted enablement.

### Versioning

- Public APIs, workflow contracts, connector definitions, and SDKs must be versioned.

### Localization

- Presentation and notifications must support localization.
- Domain and event contracts should remain locale-neutral.

## AI Platform Rules

MADAR will eventually include AI agents. The platform must constrain them from day one.

### AI may

- propose actions
- classify events
- summarize performance
- generate recommended workflows
- request approved commands
- trigger workflows through the same platform interfaces as users

### AI may not

- bypass authorization
- write directly to storage
- mutate domain state without a command
- ignore tenant scope
- execute arbitrary provider calls outside platform policies
- assume connector-specific semantics without registry contracts

### AI execution model

AI agents should operate as command producers and event consumers.

That means:

- AI reads approved domain state and events
- AI proposes or issues commands
- the platform validates, authorizes, and persists the result
- AI never becomes an alternate source of truth

## Automation Platform

Automation must be provider-independent and event-driven.

### Automation inputs

- CampaignCreated
- CampaignPerformanceDropped
- ROASChanged
- BudgetExceeded
- SyncCompleted
- SyncFailed
- CustomerCreated
- ConnectionDegraded
- WorkflowCompleted
- InvoicePaid
- SubscriptionChanged

### Automation properties

- Automation rules consume canonical MADAR events.
- Automation outputs are commands, notifications, or workflow requests.
- Automation must not depend on Google Ads or any provider-specific payload shape.

### Automation rule invariants

- Rules must be tenant-scoped.
- Rules must be versioned.
- Rules must be auditable.

## Public Platform

MADAR is expected to expose multiple public surfaces.

### Public REST API

- Canonical programmatic API for first-party and third-party consumers.

### Public GraphQL API

- Read-oriented graph for dashboards, apps, and integrations.

### Webhook Platform

- Provider webhooks in
- tenant webhooks out

### Developer SDK

- Connector SDK
- App SDK
- Workflow SDK

### CLI

- Operational interface for platform administration and developer workflows.

### Marketplace

- Connector distribution
- plugin discovery
- verified app listings

### Third-party Apps

- Apps must integrate through public APIs and approved events.
- Apps must not rely on internal implementation details.

## Plugin System

Everything external is a plugin.

That includes:

- Google Ads
- Meta
- TikTok
- Shopify
- Slack
- Stripe
- OpenAI
- Anthropic
- future data sources
- future AI providers
- future automation adapters

### Plugin types

- Connector plugins
- Workflow plugins
- AI plugins
- Notification plugins
- Search plugins
- Storage plugins
- Marketplace plugins
- Developer tooling plugins

### Plugin contract rules

- Plugins must declare capabilities.
- Plugins must declare version compatibility.
- Plugins must not bypass platform authorization.
- Plugins must use platform events and commands.

## Workflow and Automation Relationship

Workflows are execution contracts.
Automation is event-driven policy.

They are related but not the same.

- Workflows execute a bounded operational process.
- Automation reacts to canonical events and may request workflows or commands.

## Storage Strategy

The storage layer must support the platform rather than define it.

### Storage classes

- System of record storage for domain entities
- Event and outbox storage for reliability
- Object storage for raw payloads, artifacts, and exports
- Search indexes for retrieval
- Cache storage for performance

### Storage invariants

- Storage ownership follows bounded contexts.
- No single storage table should become a disguised global state bucket.

## Observability Strategy

Observability is part of the platform contract.

### Observability requirements

- Every command has a traceable execution id.
- Every workflow has a workflow run id and correlation id.
- Every job has lease and attempt lineage.
- Every event has causation and correlation metadata.
- Every connector has health and latency visibility.

### Required signal types

- logs
- metrics
- traces
- events
- operational snapshots
- audit records

### Observability invariants

- Observability must be tenant-aware.
- Observability must be secret-redacted.
- Observability must work across synchronous and asynchronous boundaries.

## Scalability Model

The platform must be designed for:

- 100,000 organizations
- 1,000,000 workspaces
- millions of workflows
- millions of syncs
- thousands of concurrent jobs

### Scaling strategy

#### 1. Stateless control plane

The backend API and application services should remain stateless where possible.

#### 2. Partitionable execution plane

n8n and worker-based systems must scale horizontally by connector, tenant, or workflow type.

#### 3. Event-driven coordination

High-volume operations must rely on events, queues, and checkpoints instead of synchronous chains.

#### 4. Read-model optimization

Dashboards and public read APIs should be served from read models, not raw operational tables.

#### 5. Bounded concurrency

Provider calls, tenant jobs, and workflow executions must be concurrency-limited.

#### 6. Hot-path minimization

Commands should be fast. Heavy execution belongs to the workflow and automation layers.

## Multi-Tenant Strategy

Every meaningful aggregate must belong to:

- Organization
- Workspace
- Project

### Tenant isolation rules

- No global business state.
- No cross-tenant default behavior.
- No shared mutable execution state without tenant keys.
- Every background task carries tenant context.

### Isolation options

- Logical isolation by tenant columns
- Strict authorization enforcement at the service layer
- Optional hard isolation for enterprise deployments

### Tenant hierarchy

- Organization is the top-level owner.
- Workspace is the operational boundary.
- Project is the business and execution boundary.

## Versioning Strategy

Versioning must exist for all public contracts.

### Versioned artifacts

- APIs
- workflows
- connectors
- SDKs
- events where schema evolution matters
- notification templates

### Compatibility rules

- New versions must not silently break old tenants.
- Breaking changes require explicit version release and migration semantics.

## Security Model

### Access control

- RBAC and policy-based authorization across all surfaces
- service-to-service authorization for execution and background processing
- public developer APIs with scoped tokens

### Data security

- encryption at rest
- encryption in transit
- secret redaction
- payload minimization

### Platform protections

- rate limiting
- abuse detection
- replay protection
- webhook verification
- idempotency enforcement
- anomaly detection

## Recommended Technological Shape

The technology stack should support the foundation, not define it.

### Control plane

- TypeScript backend
- PostgreSQL as system of record
- Redis or equivalent for queue coordination and leases
- Event outbox pattern

### Execution plane

- n8n as generic workflow execution engine
- queue or broker for dispatch and retries
- worker pools for long-running tasks

### Observability plane

- structured logs
- metrics aggregation
- distributed tracing
- alert routing

### Extensibility plane

- connector SDK
- workflow SDK
- plugin registry
- marketplace distribution

## Canonical Platform Invariant

The most important rule in MADAR is this:

No layer below the domain may redefine the domain.

That means:

- presentation may not define business rules
- experience may not define policy
- API may not define state
- application may not define provider logic
- infrastructure may not define ownership
- integration may not bypass commands
- workflow may not own entities
- automation may not override policy
- AI may not bypass commands

## Final Verdict

MADAR’s platform foundation must be treated as a durable operating system for marketing intelligence.

The architecture must prioritize:

- clean tenancy
- generic connectors
- versioned workflows
- event-driven automation
- AI safety
- public extensibility
- operational visibility
- high-scale execution

The platform should evolve slowly at the foundation and quickly at the edges.
That is how it can scale for the next ten years without collapsing into connector-specific complexity.
