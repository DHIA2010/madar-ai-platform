-- Real data-sync pipeline for Zid: tracks sync runs and stores fetched
-- products/orders/customers, identical shape to salla_sync_runs/salla_records
-- (022_salla_data_sync.sql) -- see sync-service.ts for why a shared/generic sync schema
-- was deliberately not used instead. Includes the batched-upsert lesson learned from the
-- other connectors' sync-repository.ts from day one (see UPSERT_BATCH_SIZE there).
create table if not exists zid_sync_runs (
  id uuid primary key,
  connection_id uuid not null references zid_oauth_connections(id),
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
  constraint zid_sync_runs_status_check check (status in ('pending', 'running', 'completed', 'failed'))
);

create unique index if not exists uq_zid_sync_runs_connection_idempotency
  on zid_sync_runs(connection_id, idempotency_key);

create index if not exists idx_zid_sync_runs_connection on zid_sync_runs(connection_id, created_at desc);

-- One row per synced Zid product/order/customer. entity_id is Zid's own record id
-- (unique per connection+entity_type), payload is the raw API object -- re-syncing upserts
-- rather than duplicating rows.
create table if not exists zid_records (
  id uuid primary key,
  connection_id uuid not null references zid_oauth_connections(id),
  customer_id text not null,
  entity_type varchar(32) not null,
  entity_id text not null,
  record_date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zid_records_entity_type_check check (entity_type in ('products', 'orders', 'customers')),
  constraint uq_zid_record unique (connection_id, entity_type, entity_id)
);

create index if not exists idx_zid_records_connection_type on zid_records(connection_id, entity_type);
create index if not exists idx_zid_records_record_date on zid_records(record_date);
