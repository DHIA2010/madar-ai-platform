-- Real data-sync pipeline for Salla: tracks sync runs and stores fetched
-- products/orders/customers, following the same sync-run shape already used by
-- google_ads_sync_runs (idempotency-keyed upsert, status/metrics tracking). Deliberately
-- lighter than Google Ads' engine: no distributed lock or per-stage checkpoint tables,
-- since a single store's product/order/customer pull is a bounded, fast paginated walk
-- rather than a large incremental ad-metrics pull -- see sync-service.ts for details.
create table if not exists salla_sync_runs (
  id uuid primary key,
  connection_id uuid not null references salla_oauth_connections(id),
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
  constraint salla_sync_runs_status_check check (status in ('pending', 'running', 'completed', 'failed'))
);

create unique index if not exists uq_salla_sync_runs_connection_idempotency
  on salla_sync_runs(connection_id, idempotency_key);

create index if not exists idx_salla_sync_runs_connection on salla_sync_runs(connection_id, created_at desc);

-- One row per synced Salla product/order/customer. entity_id is Salla's own record id
-- (unique per connection+entity_type), payload is the raw API object -- re-syncing upserts
-- rather than duplicating rows.
create table if not exists salla_records (
  id uuid primary key,
  connection_id uuid not null references salla_oauth_connections(id),
  customer_id text not null,
  entity_type varchar(32) not null,
  entity_id text not null,
  record_date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salla_records_entity_type_check check (entity_type in ('products', 'orders', 'customers')),
  constraint uq_salla_record unique (connection_id, entity_type, entity_id)
);

create index if not exists idx_salla_records_connection_type on salla_records(connection_id, entity_type);
create index if not exists idx_salla_records_record_date on salla_records(record_date);
