-- Real data-sync pipeline for Snapchat Ads: tracks sync runs and stores fetched
-- campaigns/ads/stats. Identical shape to salla_sync_runs/salla_records
-- (022_salla_data_sync.sql) -- see sync-service.ts for why a shared/generic sync
-- schema was deliberately not used instead.
create table if not exists snapchat_sync_runs (
  id uuid primary key,
  connection_id uuid not null references snapchat_oauth_connections(id),
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
  constraint snapchat_sync_runs_status_check check (status in ('pending', 'running', 'completed', 'failed'))
);

create unique index if not exists uq_snapchat_sync_runs_connection_idempotency
  on snapchat_sync_runs(connection_id, idempotency_key);

create index if not exists idx_snapchat_sync_runs_connection on snapchat_sync_runs(connection_id, created_at desc);

-- One row per synced Snapchat campaign/ad/stats-day. entity_id is Snapchat's own record id
-- for campaigns/ads; for stats (which have no stable id of their own) it's
-- "{account_id}:{start_time}". payload is the raw API object -- re-syncing upserts rather
-- than duplicating rows.
create table if not exists snapchat_records (
  id uuid primary key,
  connection_id uuid not null references snapchat_oauth_connections(id),
  customer_id text not null,
  entity_type varchar(32) not null,
  entity_id text not null,
  record_date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint snapchat_records_entity_type_check check (entity_type in ('campaigns', 'ads', 'stats')),
  constraint uq_snapchat_record unique (connection_id, entity_type, entity_id)
);

create index if not exists idx_snapchat_records_connection_type on snapchat_records(connection_id, entity_type);
create index if not exists idx_snapchat_records_record_date on snapchat_records(record_date);
