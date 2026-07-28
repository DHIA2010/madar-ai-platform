# EVENT_CATALOG

## Event Envelope Standard
Every event must include:
- event_id (uuid)
- event_type
- schema_version
- occurred_at
- producer
- organization_id
- workspace_id (optional)
- correlation_id
- causation_id
- payload

## Core Domain Events

Identity and Access:
- UserCreated
- UserInvited
- UserActivated
- SessionStarted
- SessionTerminated
- RoleAssigned

Organization and Workspace:
- OrganizationCreated
- WorkspaceCreated
- WorkspaceArchived
- MembershipAdded
- MembershipRemoved

Campaigns and Marketing:
- CampaignCreated
- CampaignUpdated
- CampaignLaunched
- CampaignPaused
- CampaignArchived

Integrations:
- ConnectorAuthorized
- ConnectorTokenRefreshed
- ConnectorSyncRequested
- ConnectorSyncCompleted
- ConnectorSyncFailed
- WebhookReceived
- AdsImported

Analytics and Reporting:
- MetricIngested
- AttributionUpdated
- DashboardRefreshed
- ReportGenerationRequested
- ReportGenerated
- ReportGenerationFailed

AI:
- AIConversationStarted
- AIMessageReceived
- AIInsightRequested
- AIInsightCompleted
- AgentRunStarted
- AgentRunCompleted
- AgentRunFailed
- TokenUsageRecorded

Billing:
- SubscriptionStarted
- SubscriptionChanged
- InvoiceIssued
- InvoicePaid
- InvoicePaymentFailed
- EntitlementUpdated

Notifications and Audit:
- NotificationRequested
- NotificationDelivered
- NotificationFailed
- AuditEventRecorded

## Publisher/Subscriber Matrix (Summary)
- Campaign service publishes campaign lifecycle events; analytics, reporting, notifications subscribe.
- Integration service publishes sync/import events; analytics and campaigns subscribe.
- AI service publishes insight/agent events; dashboards, notifications, audit subscribe.
- Billing publishes entitlement events; gateway/auth/workspace subscribe.

## Retry Strategy
- At-least-once delivery.
- Exponential backoff with jitter.
- Max retry policy by event class (critical vs non-critical).
- Poison events routed to DLQ after retry exhaustion.

## Idempotency
- Consumer idempotency key: event_id + consumer_name.
- Dedup store with TTL for processed event keys.
- Command-side idempotency for externally-triggered requests.

## Dead Letter Strategy
- Dedicated DLQ per major domain stream.
- Automatic alerting on DLQ depth/age thresholds.
- Replay tooling with schema validation before requeue.

## Queue Compatibility
Design compatible with:
- SQS/SNS
- Kafka
- RabbitMQ
- Cloud-native managed event buses
