# INTEGRATION_ARCHITECTURE

## Goals
Provide a uniform connector framework for Google Ads, Meta Ads, TikTok Ads, Snapchat Ads, Shopify, Salla, Zid, WooCommerce, and GA4.

## Connector Abstraction Layer
Core interfaces:
- ConnectorAuthAdapter: OAuth/token lifecycle.
- ConnectorDataAdapter: pull/push resource mapping.
- ConnectorWebhookAdapter: webhook verification/normalization.
- ConnectorRateLimitPolicy: token bucket and backoff policy.

Normalized models:
- ExternalAccount
- ExternalCampaign
- ExternalAdSet
- ExternalAd
- ExternalMetricBatch
- ExternalOrder
- ExternalEvent

## OAuth and Token Model
- Authorization Code flow where available.
- Store refresh/access tokens encrypted, scoped per connection.
- Token rotation and expiry monitoring.
- Re-auth required state emitted as connection health event.

## Ingestion Modes
1. Webhook-first (preferred): near real-time updates.
2. Polling fallback: periodic sync for providers lacking complete webhooks.
3. Historical backfill jobs for first-time connection bootstrap.

## Webhook Processing
- Signature verification per provider.
- Idempotency via provider event id + connection id.
- Raw payload archive to S3 for replay/forensics.
- Async normalization pipeline to canonical events.

## Rate Limiting and Retries
- Per-connector and per-tenant quotas.
- Adaptive concurrency based on provider responses.
- Exponential backoff with jitter for transient failures.
- Circuit breaker to protect provider and platform.

## Error Handling
Error classes:
- AuthExpired
- PermissionDenied
- RateLimited
- ProviderUnavailable
- InvalidPayload

Actions:
- Retries for transient classes.
- Escalation/notification for persistent auth and permission errors.
- Health state updates surfaced in integration dashboard.

## Anti-Corruption Layer Rules
- Never leak provider-specific schema to core domains.
- Mapping layer owns all conversion logic and versioning.
- Core services consume canonical MADAR integration contracts only.

## Security
- Principle of least scope per connector.
- Secret rotation policies and credential access auditing.
- Webhook endpoint hardening and replay protection.
