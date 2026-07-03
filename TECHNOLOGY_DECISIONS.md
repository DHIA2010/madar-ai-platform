# TECHNOLOGY_DECISIONS

## Decision Summary

## Backend Architecture
Decision: Modular Monolith first, Hybrid extraction later.
Reason: fastest safe path with clear domain ownership and lower initial ops burden.

## Primary Datastore
Decision: PostgreSQL as transactional source of truth.
Reason: strong consistency, mature tooling, relational modeling for SaaS domains.

## Cache and Coordination
Decision: Redis.
Reason: low-latency caching, locks, counters, ephemeral workflow state.

## Eventing and Jobs
Decision: event bus + queue-backed worker model.
Reason: decouple write path from heavy async workloads.

## Object Storage
Decision: S3-compatible object storage.
Reason: reports, exports, raw connector payload archives, artifacts.

## Search
Decision: dedicated search engine for full-text/faceted discovery.
Reason: avoid overloading transactional DB with search concerns.

## Vector Retrieval
Decision: dedicated vector DB for semantic retrieval and AI memory.
Reason: RAG performance and retrieval quality requirements.

## Analytics
Decision: warehouse for large-scale aggregations.
Reason: cost/performance isolation from OLTP workload.

## API Contracts
Decision: versioned HTTP APIs + schema-managed events.
Reason: predictable compatibility across services and integrations.

## AI Model Strategy
Decision: provider abstraction (OpenAI, Anthropic, local models).
Reason: avoid vendor lock-in and allow workload-optimized routing.

## Security Model
Decision: tenant-scoped RBAC with defense-in-depth controls.
Reason: SaaS isolation and enterprise trust requirements.

## Observability
Decision: unified logs, metrics, traces, audit events.
Reason: operational reliability and compliance needs.

## Not Chosen (for now)
- Pure microservices from day one: rejected due to complexity/coordination overhead.
- Single database for analytics/search/vector use-cases: rejected for scale and workload isolation.
