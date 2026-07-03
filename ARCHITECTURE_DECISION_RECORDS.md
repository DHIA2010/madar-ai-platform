# ARCHITECTURE_DECISION_RECORDS

## ADR-001: Architectural Style
Status: Accepted
Decision: Adopt Hybrid path (modular monolith -> selective service extraction).
Context: Need fast delivery now and scalable boundaries later.
Consequences: Lower initial ops complexity; requires strong boundary governance.

## ADR-002: Tenant Isolation
Status: Accepted
Decision: Organization-scoped tenancy with workspace sub-scope.
Context: Multi-tenant SaaS with enterprise controls.
Consequences: All domain records require tenant identifiers and scoped authorization.

## ADR-003: Event-Driven Async Processing
Status: Accepted
Decision: Use domain events and queue-backed workers for long-running jobs.
Context: Integrations, reporting, and AI are async-heavy.
Consequences: Must enforce idempotency and event schema versioning.

## ADR-004: Integration ACL
Status: Accepted
Decision: Provider-specific adapters behind canonical integration contracts.
Context: Heterogeneous APIs (ads, commerce, analytics).
Consequences: Reduced coupling; ongoing mapping maintenance.

## ADR-005: AI Provider Abstraction
Status: Accepted
Decision: Model provider interface with pluggable backends.
Context: Need support for OpenAI/Anthropic/local.
Consequences: Additional abstraction layer but avoids lock-in.

## ADR-006: Data Platform Split
Status: Accepted
Decision: Use OLTP PostgreSQL + specialized stores (Redis/S3/vector/search/warehouse).
Context: Mixed workloads at scale.
Consequences: Increased data architecture complexity; better performance isolation.

## ADR-007: Security Baseline
Status: Accepted
Decision: Mandatory RBAC, audit trails, secrets management, encryption by default.
Context: Enterprise SaaS expectations and compliance readiness.
Consequences: More policy and governance implementation work early.

## ADR-008: Service Extraction Criteria
Status: Accepted
Decision: Extract a domain from monolith when one or more triggers are met:
- Team ownership bottleneck.
- Distinct scaling profile.
- Frequent independent releases required.
- Blast radius risk unacceptable.
Consequences: extraction is objective and measurable, not opinion-driven.

## ADR-009: Canonical Identity Backend
Status: Accepted
Decision: Consolidate identity backend behavior under `src/identity-platform` as the single source of truth.
Context: Sprint 3 produced parallel identity implementations, which created contract drift and operational ambiguity.
Consequences: Docker and compatibility wrappers must delegate to the canonical module rather than owning separate logic.

## ADR-010: Clean Architecture For Identity Platform
Status: Accepted
Decision: Separate identity backend into domain, application, interfaces, infrastructure, configuration, bootstrap, and dependency-injection layers.
Context: Route and service logic previously mixed business rules, transport, and infrastructure concerns.
Consequences: More explicit structure, stronger testability, and easier module growth.

## ADR-011: Repository Interfaces At The Domain Boundary
Status: Accepted
Decision: Define repository contracts in the domain boundary and implement them through infrastructure adapters.
Context: In-memory Maps previously leaked directly into application logic.
Consequences: Persistence can move to PostgreSQL without changing use-case orchestration.

## ADR-012: Thin REST Adapter
Status: Accepted
Decision: Restrict REST responsibilities to validation, authentication token extraction, request context creation, error mapping, and response formatting.
Context: Controller-level business logic caused coupling and hidden rules.
Consequences: Business logic is now testable without transport bootstrapping.

## ADR-013: Centralized Identity Configuration
Status: Accepted
Decision: Centralize identity configuration under `src/identity-platform/configuration`.
Context: Token TTLs, secrets, and lockout settings were previously scattered.
Consequences: Runtime behavior is easier to audit and safer to evolve.

## ADR-014: Observability Foundation
Status: Accepted
Decision: Introduce request IDs, correlation IDs, health/readiness endpoints, structured logger abstraction, and audit hooks as the minimum observability baseline.
Context: Foundational backend modules require diagnosable operational behavior before feature growth.
Consequences: Metrics and tracing can be layered in without changing core use cases.

## ADR-015: Replaceable In-Memory Adapters
Status: Accepted
Decision: Keep in-memory adapters only as infrastructure defaults behind stable ports during Sprint 3.1.
Context: Sprint 3.1 is an architecture-hardening sprint, not a persistence rollout sprint.
Consequences: The backend is architecture-ready but not yet production-ready for durable traffic.

## ADR-016: Async Repository And Provider Contracts
Status: Accepted
Decision: Convert identity repository and external-provider contracts to async `Promise`-based APIs.
Context: Real PostgreSQL and Redis adapters cannot be implemented correctly behind synchronous contracts in Node.js.
Consequences: Internal handler and adapter code becomes async-safe while external REST behavior remains unchanged.

## ADR-017: PostgreSQL As Durable Record System
Status: Accepted
Decision: Use PostgreSQL for durable identity records, audit logs, feature-flag storage readiness, and outbox event persistence.
Context: Identity entities require transactional durability and future reporting-grade traceability.
Consequences: Session and cache concerns stay outside PostgreSQL.

## ADR-018: Redis For Volatile Distributed State
Status: Accepted
Decision: Use Redis for sessions, refresh-token lookups, rate limiting, and cache concerns.
Context: These workloads require TTL-aware, distributed, low-latency state handling.
Consequences: Multi-instance application nodes can share revocation and throttling state.

## ADR-019: Outbox Pattern Before External Queue
Status: Accepted
Decision: Persist domain events into a PostgreSQL outbox before introducing Kafka, SQS, or other brokers.
Context: The platform needs reliable event capture now, but not a full async platform rollout yet.
Consequences: Subscriber and dispatcher layers can evolve later without rewriting use cases.

## ADR-020: Environment-Backed Feature Flags And Configuration Providers
Status: Accepted
Decision: Introduce explicit providers for feature flags and configuration rather than direct environment access in application code.
Context: Foundation layers must avoid environment coupling and stay testable.
Consequences: Future per-workspace overrides and rollout strategies fit without architectural churn.

## ADR-021: Health, Readiness, And Liveness Separation
Status: Accepted
Decision: Expose separate liveness, readiness, and composite health endpoints.
Context: Operational systems need to distinguish process life from infrastructure readiness.
Consequences: Deployments and orchestrators can make safer restart and routing decisions.
