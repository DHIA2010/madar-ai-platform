# SCALABILITY_GUIDE

## Capacity Targets
- Stage 1: 10 organizations
- Stage 2: 100 organizations
- Stage 3: 1,000 organizations
- Stage 4: 10,000 organizations

## Scaling Strategy by Stage

## 10 Organizations
- Single-region deployment.
- Modular monolith + worker process.
- PostgreSQL primary + read replica optional.
- Redis cache for sessions and hot reads.

## 100 Organizations
- Horizontal API autoscaling.
- Dedicated background worker pool for sync/report jobs.
- Queue-driven integration ingestion.
- Partition heavy tables by organization_id/time for analytics workloads.

## 1,000 Organizations
- Extract Integration and AI services from monolith.
- Introduce analytics warehouse pipeline.
- Enable search and vector stores for assistant/reporting experiences.
- Add per-tenant rate limits and workload fairness controls.

## 10,000 Organizations
- Multi-cluster deployment and domain-based service isolation.
- Service-level autoscaling with SLO-driven policies.
- Data tier scaling: logical sharding and read-model distribution.
- Regional expansion with tenant placement controls.

## Domain Hotspot Strategy
- Integrations: queue lag autoscaling, connector partition workers.
- AI: separate online inference and batch agent worker pools.
- Reporting: async generation with export artifact pipeline.
- Analytics: warehouse offloading for large aggregations.

## Performance Guardrails
- API p95 latency SLOs by endpoint class.
- Job completion SLOs by domain (sync/report/agent).
- Cache hit ratio thresholds.
- Queue lag and DLQ alarms.

## Multi-Tenant Fairness
- Per-tenant concurrency quotas.
- Burst policies by subscription tier.
- Backpressure and graceful degradation for non-critical workloads.

## Resilience and Recovery
- Retry with jitter + idempotency.
- Circuit breakers for external dependencies.
- Point-in-time restore for transactional DB.
- Runbook-driven failover tests.
