# CONNECTOR_ROADMAP

## Delivery Strategy
- Wave 1 (P0): Google Ads, Meta Ads, GA4
- Wave 2 (P1): TikTok Ads, Snapchat Ads, Shopify
- Wave 3 (P2): Salla, Zid, WooCommerce

## Standard Connector Phases
1. Discovery and API contract mapping.
2. OAuth scope design and app registration.
3. Connection and token lifecycle implementation.
4. Initial historical import pipeline.
5. Incremental sync (polling + webhook where available).
6. Retry/idempotency hardening.
7. Monitoring and alerting.
8. Integration and contract test suite.

## Google Ads
- OAuth tasks: auth code flow, offline access, account picker.
- Refresh tasks: proactive refresh scheduler + expiry alarms.
- Import pipeline: campaigns/ad groups/ads/metrics.
- Webhooks: N/A primary, polling required.
- Sync scheduler: hourly metrics + daily backfill.
- Retry: quota-aware exponential backoff.
- Monitoring: token refresh failures, sync lag, API quota usage.
- DoD: stable sync for 7 days in stage with <1% failed jobs.

## Meta Ads
- OAuth tasks: business account scope flow.
- Refresh tasks: long-lived token lifecycle checks.
- Import pipeline: campaigns/adsets/ads/insights.
- Webhooks: lead and status changes where supported.
- Sync scheduler: near-real-time webhooks + hourly reconciliation polling.
- Retry: permission-aware error classification.
- Monitoring: webhook signature failures, permission drops.
- DoD: webhook + polling consistency checks pass.

## GA4
- OAuth tasks: analytics read scopes and property selection.
- Refresh tasks: token renewal and revoked grant detection.
- Import pipeline: traffic/conversion events and dimensions.
- Webhooks: none; scheduled pull.
- Sync scheduler: hourly incremental + daily correction run.
- Retry: transient analytics API failure policy.
- Monitoring: property-level sync freshness.
- DoD: data latency SLA met for primary dashboards.

## TikTok Ads
- OAuth tasks: advertiser authorization flow.
- Import pipeline: campaigns/adgroups/ads/performance.
- Webhooks: limited support; rely on polling.
- Scheduler: hourly and daily backfill.
- DoD: parity with Wave 1 metric quality controls.

## Snapchat Ads
- OAuth tasks: advertiser account consent.
- Import pipeline: entities and insight metrics.
- Webhooks: evaluate support; fallback polling.
- Scheduler: hourly with retry windows.
- DoD: operational health + dashboard parity.

## Shopify
- OAuth tasks: store app auth flow.
- Import pipeline: orders/customers/products/revenue events.
- Webhooks: order/customer/product events.
- Scheduler: webhook-first with reconciliation job.
- DoD: commerce metrics consistency with source system.

## Salla
- OAuth/tasks: provider-specific auth and store linkage.
- Import pipeline: orders/products/customers.
- Webhooks: event ingestion and normalization.
- Scheduler: webhook-first + nightly reconcile.
- DoD: stable sync + localized mapping correctness.

## Zid
- OAuth/tasks: platform auth and account mapping.
- Import pipeline: orders/products/inventory references.
- Webhooks: supported events and retries.
- Scheduler: mixed webhook/polling.
- DoD: SLA-compliant sync and error observability.

## WooCommerce
- OAuth/tasks: token/app credential model.
- Import pipeline: orders/customers/products.
- Webhooks: event subscriptions per store.
- Scheduler: webhook-first + periodic reconciliation.
- DoD: stable connector health and replay-safe processing.
