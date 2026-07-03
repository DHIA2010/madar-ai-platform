# SERVICE_CATALOG

## Recommended Service Topology
Initial runtime: Modular Monolith.
Extraction-ready services: Integration, AI, Reporting, Notification, Job Processing.

## Service Definitions

## 1. API Gateway / BFF
Responsibilities:
- Authenticated request routing.
- Aggregation for frontend view models.
- Rate-limit and policy enforcement.
Inputs: HTTP/GraphQL requests.
Outputs: client-facing response contracts.
External systems: identity provider, core services.
Storage: none.
Scaling: horizontal stateless autoscaling.

## 2. Auth Service
Responsibilities:
- Login, session, token issuance, password flows, MFA.
Inputs: credential and session requests.
Outputs: tokens, session state, auth events.
External systems: email/SMS providers for verification.
Storage: PostgreSQL + Redis session cache.
Scaling: CPU-bound stateless API + Redis-backed sessions.

## 3. Organization/Workspace Service
Responsibilities:
- Organization lifecycle, workspace provisioning, membership mapping.
Inputs: org/workspace admin commands.
Outputs: org/workspace events, membership read models.
External systems: billing entitlement checks.
Storage: PostgreSQL.
Scaling: horizontal API; bounded by transactional throughput.

## 4. Campaign Service
Responsibilities:
- Campaign CRUD, lifecycle transitions, audience/creative metadata.
Inputs: user commands and integration sync updates.
Outputs: campaign events and domain projections.
External systems: integration service (indirect via events/APIs).
Storage: PostgreSQL.
Scaling: sharded by organization_id at high scale.

## 5. Integration Service
Responsibilities:
- Connector authorization, token refresh, webhook handling, polling orchestration.
Inputs: OAuth callbacks, webhook payloads, scheduler triggers.
Outputs: normalized sync events and connection health states.
External systems: Google, Meta, TikTok, Snapchat, Shopify, Salla, Zid, WooCommerce, GA4.
Storage: PostgreSQL + encrypted secrets store + S3 raw payload archive.
Scaling: queue-backed workers, per-connector concurrency control.

## 6. Analytics Service
Responsibilities:
- Ingest normalized events, maintain metric models, query analytics endpoints.
Inputs: integration events, internal product events.
Outputs: aggregate metrics, time-series APIs.
External systems: warehouse pipeline.
Storage: PostgreSQL (hot), warehouse (cold/analytical).
Scaling: partitioned ingestion workers and read replicas.

## 7. Reporting Service
Responsibilities:
- Report generation, scheduling, export artifacts.
Inputs: report run requests and schedules.
Outputs: report artifacts and completion events.
External systems: object storage, email/notification.
Storage: PostgreSQL + S3.
Scaling: async worker pool with queue depth autoscaling.

## 8. AI Service
Responsibilities:
- Prompt orchestration, tool execution mediation, agent runs, token tracking.
Inputs: user prompts, automation triggers, context snapshots.
Outputs: streamed responses, insights, agent completion events.
External systems: LLM providers, vector DB, tool APIs.
Storage: PostgreSQL + vector DB + Redis.
Scaling: separate online inference and async agent workers.

## 9. Billing Service
Responsibilities:
- Subscription management, invoices, payment webhooks, entitlement projection.
Inputs: plan changes, usage records, payment events.
Outputs: entitlement events, invoice states.
External systems: payment provider.
Storage: PostgreSQL.
Scaling: event-driven; low-latency API for entitlement checks.

## 10. Notification Service
Responsibilities:
- Delivery orchestration for email/in-app/webhooks.
Inputs: notification events from domains.
Outputs: delivery status events.
External systems: SMTP/provider APIs, webhook endpoints.
Storage: PostgreSQL + Redis retry state.
Scaling: queue workers with per-channel throttles.

## 11. Job Processing and Scheduler
Responsibilities:
- Central queue workers, retries, cron schedules, dead-letter handling.
Inputs: scheduled triggers and queued jobs.
Outputs: job lifecycle events.
External systems: queue broker, metrics stack.
Storage: queue backend + Redis locks.
Scaling: autoscale on queue depth and lag.
