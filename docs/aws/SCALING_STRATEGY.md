# Scaling Strategy

## 14. Scaling Strategy

### Frontend (Next.js on ECS)

- Horizontal scaling via ECS Service Auto Scaling.
- Baseline production min tasks: 3.
- Scale-out trigger: average CPU >= 60%.
- Scale-in stabilization to avoid thrashing.
- CloudFront used to absorb global traffic spikes.

### Backend (NestJS placeholder to future API)

- Horizontal scale by CPU and request latency.
- Separate worker service for async jobs.
- Queue-centric design recommended for spikes (SQS/EventBridge).

### Database (PostgreSQL)

- Multi-AZ for HA.
- Vertical scale first for predictable performance.
- Add read replicas for analytics/reporting workloads.
- Partition large tables and tune indexes before major scale events.

### Cache (Redis)

- Multi-AZ with auto-failover.
- Scale node class when memory pressure rises.
- Use TTL and keyspace hygiene to prevent eviction storms.

### AI and background workers

- Run as independent ECS services.
- Use autoscaling from queue depth and processing latency.
- Isolate worker pools by workload type (webhook, enrichment, report generation).

### Stage vs Production capacity policy

- Stage: right-sized for integration tests and UAT, not load benchmarks.
- Production: headroom targets of 30-40% for normal peaks.

### Scaling guardrails

- Cost alarms for rapid spend increase.
- Concurrency limits for external OAuth/webhook providers.
- Rate limits and backpressure for outbound AI calls.
