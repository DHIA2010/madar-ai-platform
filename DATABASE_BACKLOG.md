# DATABASE_BACKLOG

## Migration Principles
- Domain-owned schemas.
- Additive changes first.
- Backfill + verify + switch + cleanup pattern.

## Table Backlog

## Auth Domain
### user_identity
- Owner: Authentication
- Columns: id, email, status, created_at, updated_at
- Indexes: unique(email), status
- Constraints: email not null unique
- Relationships: 1:N sessions, 1:N credentials
- Retention: active lifecycle, soft delete optional
- Migration order: 1

### session
- Owner: Authentication
- Columns: id, user_id, refresh_token_hash, device_fingerprint, expires_at, revoked_at
- Indexes: user_id, expires_at
- Constraints: FK user_id -> user_identity.id
- Retention: 90 days post-expiry
- Migration order: 2

## Organization/Workspace
### organization
- Owner: Organizations
- Columns: id, name, status, plan_tier, created_at
- Indexes: status, created_at
- Constraints: name not null
- Relationships: 1:N workspace
- Retention: contractual/legal retention
- Migration order: 3

### workspace
- Owner: Workspaces
- Columns: id, organization_id, name, status, created_at
- Indexes: organization_id, status
- Constraints: FK organization_id
- Relationships: 1:N projects, 1:N memberships
- Retention: lifecycle + archive policies
- Migration order: 4

### membership
- Owner: Workspaces
- Columns: id, organization_id, workspace_id, user_id, role, created_at
- Indexes: (workspace_id,user_id), role
- Constraints: unique(workspace_id,user_id)
- Relationships: FK workspace/user
- Retention: auditable history (soft delete)
- Migration order: 5

## Campaigns
### campaign
- Owner: Campaigns
- Columns: id, organization_id, workspace_id, name, objective, status, budget_amount, created_at
- Indexes: organization_id, workspace_id, status, created_at
- Constraints: FK workspace, check(status)
- Relationships: N:1 workspace
- Retention: 24 months active + archive
- Migration order: 6

## Integrations
### connection
- Owner: Integrations
- Columns: id, organization_id, workspace_id, provider, external_account_id, status, created_at
- Indexes: (workspace_id,provider), status
- Constraints: unique(workspace_id,provider,external_account_id)
- Relationships: 1:N sync_job, 1:1 oauth_token
- Retention: while active + 12 months after disconnect
- Migration order: 7

### oauth_token
- Owner: Integrations
- Columns: id, connection_id, access_token_enc, refresh_token_enc, expires_at, scopes, rotated_at
- Indexes: connection_id, expires_at
- Constraints: FK connection_id unique
- Relationships: 1:1 connection
- Retention: active only, rotate history optional separate table
- Migration order: 8

### sync_job
- Owner: Integrations
- Columns: id, connection_id, trigger_type, status, started_at, finished_at, error_code
- Indexes: connection_id, status, started_at
- Constraints: FK connection_id
- Relationships: N:1 connection
- Retention: 12 months
- Migration order: 9

## Analytics
### metric_series
- Owner: Analytics
- Columns: id, organization_id, workspace_id, source, metric_key, dimensions_json, value, bucket_start
- Indexes: (organization_id,workspace_id,metric_key,bucket_start), source
- Constraints: not null organization/workspace/metric
- Relationships: none strict
- Retention: hot 12 months in OLTP, long-term in warehouse
- Migration order: 10

## Reporting
### report_definition
- Owner: Reporting
- Columns: id, organization_id, workspace_id, name, config_json, schedule_cron, created_at
- Indexes: workspace_id, created_at
- Constraints: FK workspace
- Relationships: 1:N report_run
- Retention: active + archive
- Migration order: 11

### report_run
- Owner: Reporting
- Columns: id, report_id, status, requested_by, started_at, finished_at, artifact_uri
- Indexes: report_id, status, started_at
- Constraints: FK report_id
- Relationships: N:1 report_definition
- Retention: 12 months metadata, artifact retention by policy
- Migration order: 12

## AI
### conversation
- Owner: AI
- Columns: id, organization_id, workspace_id, user_id, title, created_at
- Indexes: (workspace_id,user_id), created_at
- Constraints: FK workspace/user
- Relationships: 1:N message
- Retention: plan-based retention + delete controls
- Migration order: 13

### message
- Owner: AI
- Columns: id, conversation_id, role, content, token_input, token_output, created_at
- Indexes: conversation_id, created_at
- Constraints: FK conversation_id
- Relationships: N:1 conversation
- Retention: follows conversation policy
- Migration order: 14

### token_usage
- Owner: AI
- Columns: id, organization_id, workspace_id, provider, model, tokens_total, cost_amount, recorded_at
- Indexes: (organization_id,workspace_id,recorded_at), provider
- Constraints: not null usage fields
- Relationships: optional FK message_id
- Retention: 24 months for billing and analytics
- Migration order: 15

## Billing
### subscription
- Owner: Billing
- Columns: id, organization_id, plan, status, renewal_at, created_at
- Indexes: organization_id unique, status
- Constraints: FK organization_id unique
- Relationships: 1:N invoice
- Retention: lifetime + legal retention
- Migration order: 16

### invoice
- Owner: Billing
- Columns: id, subscription_id, amount, currency, status, due_at, paid_at
- Indexes: subscription_id, status, due_at
- Constraints: FK subscription_id
- Relationships: N:1 subscription
- Retention: legal/finance retention (7+ years)
- Migration order: 17

## Audit
### audit_event
- Owner: Audit
- Columns: id, organization_id, workspace_id, actor_id, action, target_type, target_id, payload_json, occurred_at
- Indexes: organization_id, workspace_id, actor_id, occurred_at
- Constraints: immutable write-once semantics
- Relationships: none strict
- Retention: compliance policy (minimum 24 months, enterprise configurable)
- Migration order: 18
