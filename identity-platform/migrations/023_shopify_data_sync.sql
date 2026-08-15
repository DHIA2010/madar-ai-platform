-- Real data-sync pipeline for Shopify: tracks sync runs and stores fetched
-- products/orders/customers. Identical shape to salla_sync_runs/salla_records
-- (022_salla_data_sync.sql) -- see sync-service.ts for why a shared/generic sync
-- schema was deliberately not used instead.
create table if not exists shopify_sync_runs (
  id uuid primary key,
  connection_id uuid not null references shopify_oauth_connections(id),
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  project_id uuid not null,
  customer_id text not null,
  date_start date not null,
  date_end date not null,
  idempotency_key text not null,
  status varchar(32) not null default 'pending',
  metrics jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid not null references users(id),
  updated_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopify_sync_runs_status_check check (status in ('pending', 'running', 'completed', 'failed'))
);

create unique index if not exists uq_shopify_sync_runs_connection_idempotency
  on shopify_sync_runs(connection_id, idempotency_key);

create index if not exists idx_shopify_sync_runs_connection on shopify_sync_runs(connection_id, created_at desc);

-- One row per synced Shopify product/order/customer. entity_id is Shopify's own record id
-- (unique per connection+entity_type), payload is the raw API object -- re-syncing upserts
-- rather than duplicating rows.
create table if not exists shopify_records (
  id uuid primary key,
  connection_id uuid not null references shopify_oauth_connections(id),
  customer_id text not null,
  entity_type varchar(32) not null,
  entity_id text not null,
  record_date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopify_records_entity_type_check check (entity_type in ('products', 'orders', 'customers')),
  constraint uq_shopify_record unique (connection_id, entity_type, entity_id)
);

create index if not exists idx_shopify_records_connection_type on shopify_records(connection_id, entity_type);
create index if not exists idx_shopify_records_record_date on shopify_records(record_date);
