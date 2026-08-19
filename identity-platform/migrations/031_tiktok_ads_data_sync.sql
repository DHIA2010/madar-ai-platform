-- Real data-sync pipeline for TikTok Ads: tracks sync runs and stores fetched
-- campaigns/adgroups/ads/insights -- all levels of the account hierarchy
-- (advertiser -> campaign -> ad group -> ad) plus daily performance. Identical shape to
-- meta_sync_runs/meta_records (024_meta_ads_data_sync.sql).
create table if not exists tiktok_ads_sync_runs (
  id uuid primary key,
  connection_id uuid not null references tiktok_ads_oauth_connections(id),
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
  constraint tiktok_ads_sync_runs_status_check check (status in ('pending', 'running', 'completed', 'failed'))
);

create unique index if not exists uq_tiktok_ads_sync_runs_connection_idempotency
  on tiktok_ads_sync_runs(connection_id, idempotency_key);

create index if not exists idx_tiktok_ads_sync_runs_connection on tiktok_ads_sync_runs(connection_id, created_at desc);

-- One row per synced TikTok campaign/ad group/ad/insights-day. entity_id is TikTok's own
-- record id for campaigns/adgroups/ads; for insights (which have no stable id of their own)
-- it's "{campaign_id}:{stat_time_day}". payload is the raw API object -- re-syncing upserts
-- rather than duplicating rows.
create table if not exists tiktok_ads_records (
  id uuid primary key,
  connection_id uuid not null references tiktok_ads_oauth_connections(id),
  customer_id text not null,
  entity_type varchar(32) not null,
  entity_id text not null,
  record_date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tiktok_ads_records_entity_type_check check (entity_type in ('campaigns', 'adgroups', 'ads', 'insights')),
  constraint uq_tiktok_ads_record unique (connection_id, entity_type, entity_id)
);

create index if not exists idx_tiktok_ads_records_connection_type on tiktok_ads_records(connection_id, entity_type);
create index if not exists idx_tiktok_ads_records_record_date on tiktok_ads_records(record_date);
