# EVENT_IMPLEMENTATION_PLAN

## Event Delivery Contract
- Delivery guarantee: at-least-once.
- Ordering: best-effort within partition key (organization_id where feasible).
- Idempotency key: event_id + consumer.

## Priority Event Backlog

| Event | Publisher | Subscribers | Retry Policy | Idempotency | Failure Handling | Priority |
|---|---|---|---|---|---|---|
| UserCreated | Auth | Audit, Notifications, Workspace | exp backoff 5x | dedup store | DLQ + alert | P0 |
| SessionStarted | Auth | Audit, Security analytics | exp backoff 3x | dedup store | drop after DLQ + notify | P0 |
| OrganizationCreated | Organizations | Billing, Audit, Workspace | exp backoff 5x | dedup store | DLQ + manual replay | P0 |
| WorkspaceCreated | Workspace | Audit, Notifications | exp backoff 5x | dedup store | DLQ + replay | P0 |
| MembershipAdded | Workspace | Notifications, Audit | exp backoff 5x | dedup store | DLQ + replay | P0 |
| CampaignCreated | Campaign | Analytics, Reporting, Audit | exp backoff 5x | dedup store | DLQ + replay | P0 |
| ConnectorAuthorized | Integrations | Audit, Notifications, Analytics | exp backoff 5x | dedup store | DLQ + reconnect workflow | P0 |
| ConnectorSyncCompleted | Integrations | Analytics, Reporting | exp backoff 8x | idempotent upsert | DLQ + sync rerun | P0 |
| ConnectorSyncFailed | Integrations | Notifications, Ops | exp backoff 8x | dedup store | incident alert + cooldown | P0 |
| MetricIngested | Analytics | Reporting, AI | exp backoff 8x | idempotent metric merge | DLQ + batch replay | P1 |
| ReportGenerated | Reporting | Notifications, Audit | exp backoff 5x | dedup store | DLQ + rerun endpoint | P1 |
| AIInsightCompleted | AI | Notifications, Reporting, Audit | exp backoff 5x | dedup store | DLQ + recover run | P1 |
| TokenUsageRecorded | AI | Billing, FinOps | exp backoff 5x | idempotent accumulate | DLQ + manual reconciliation | P1 |
| InvoicePaid | Billing | Entitlements, Audit, Notifications | exp backoff 5x | dedup store | DLQ + payment reconciliation | P2 |

## Implementation Tasks by Event
For each event:
1. Define schema in event registry.
2. Add producer contract tests.
3. Add consumer contract tests.
4. Implement idempotency store policy.
5. Configure retries + DLQ route.
6. Add metrics: publish_count, consume_success, consume_failure, dlq_count.

## DLQ Operations
- SLO: DLQ message age < 30 minutes for P0 streams.
- Runbook: classify -> replay -> verify -> close.
- Replay prerequisites: schema compatibility + idempotent consumer behavior confirmed.
