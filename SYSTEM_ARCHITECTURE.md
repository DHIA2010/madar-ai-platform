# SYSTEM_ARCHITECTURE

## Purpose
Define the target long-term architecture for MADAR as a multi-tenant SaaS platform serving 10,000+ organizations without a platform redesign.

## Architectural Style Recommendation
Recommendation: Hybrid architecture with a Modular Monolith first, then selective service extraction.

Why:
- Current product stage favors fast iteration, strong consistency, and low operational overhead.
- Domain boundaries can be enforced now inside one deployable backend.
- High-scale/high-variance domains (integration sync, AI jobs, notifications, reporting) can be extracted later with minimal disruption.

Phased target:
1. Phase A: Modular Monolith + async jobs + event bus.
2. Phase B: Extract Integration, AI, Reporting, and Notification services.
3. Phase C: Optional split of Billing and Analytics ingestion if throughput/ownership requires it.

## Core Runtime Topology
- API Gateway/BFF layer for web and future external API consumers.
- Core application runtime (modular monolith initially).
- Background processing runtime (workers + scheduler).
- Event bus for domain and integration events.
- Streaming channel for long-running workflows (AI/report progress).

## Tenant Model
- Tenant root: Organization.
- Workspace is a sub-scope under organization.
- Data model includes `organization_id` and (where required) `workspace_id` on all tenant-owned records.
- Row-level tenancy at application and DB policy layer.

## Domain-to-Module Map
- Identity and Access: authentication, sessions, RBAC, teams.
- Organization and Workspace: org lifecycle, workspace boundaries, membership.
- Marketing and Campaigns: campaign lifecycle and operational metadata.
- Integrations: connectors, tokens, sync pipelines, webhooks.
- Analytics and Metrics: normalized event/metric ingestion and query APIs.
- Reports and Dashboards: materialized reporting models and exports.
- AI Intelligence: prompt orchestration, agent runs, token accounting, model abstraction.
- Billing and Plans: subscriptions, entitlements, usage metering.
- Notifications: in-app/email/webhook notifications.
- Audit and Compliance: immutable audit trail and policy controls.

## Data Ownership Model
Primary stores and ownership:
- PostgreSQL: transactional source of truth for platform state.
- Redis: caching, distributed locks, short-lived state, rate-limit counters.
- S3: file artifacts, exports, connector raw payload archives, report files.
- Vector DB: embeddings for semantic retrieval and AI memory retrieval.
- Search Engine: full-text and faceted search over entities and documents.
- Analytics Warehouse: large-scale analytical queries and cross-tenant aggregated analytics.

## Cross-Cutting Standards
- API contracts: versioned OpenAPI + event schema registry.
- Async contracts: idempotent consumers and schema-versioned payloads.
- Observability: structured logs, traces, metrics, SLOs per domain.
- Security baseline: least privilege, scoped secrets, encryption in transit/at rest.

## Anti-Corruption Layers
- Connector ACL: normalize external platform schemas (Google/Meta/TikTok/Shopify/etc.) into MADAR canonical models.
- AI ACL: normalize LLM providers behind model abstraction.
- Billing ACL: isolate payment gateway semantics from internal entitlement model.

## Non-Goals for This Sprint
- No backend implementation.
- No infrastructure provisioning.
- No API endpoint implementation.
