create table if not exists google_ads_sync_runs (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id),
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
  constraint google_ads_sync_runs_status_check check (status in ('pending', 'running', 'completed', 'failed')),
  constraint google_ads_sync_runs_range_check check (date_end >= date_start)
);

create unique index if not exists uq_google_ads_sync_runs_idempotency
  on google_ads_sync_runs(connection_id, idempotency_key);

create index if not exists idx_google_ads_sync_runs_org
  on google_ads_sync_runs(organization_id, created_at desc);

create table if not exists google_ads_domain_records (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id),
  sync_run_id uuid not null references google_ads_sync_runs(id) on delete cascade,
  entity_type varchar(64) not null,
  customer_id text not null,
  entity_id text not null,
  record_date date not null default date '1970-01-01',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_ads_domain_records_entity_type_check check (
    entity_type in (
      'customer_account',
      'campaign',
      'campaign_metric',
      'ad_group',
      'ad_group_metric',
      'ad',
      'ad_metric',
      'keyword',
      'keyword_metric',
      'search_term',
      'geo_metric',
      'device_metric',
      'conversion_action'
    )
  )
);

create unique index if not exists uq_google_ads_domain_records_natural
  on google_ads_domain_records(connection_id, entity_type, customer_id, entity_id, record_date);

create index if not exists idx_google_ads_domain_records_connection_type
  on google_ads_domain_records(connection_id, entity_type, record_date desc);

create table if not exists google_ads_sync_locks (
  id uuid primary key,
  provider_key text not null,
  connection_id uuid not null references google_oauth_connections(id),
  project_id uuid not null,
  organization_id uuid not null references organizations(id),
  lock_token text not null,
  locked_until timestamptz not null,
  created_by_user_id uuid not null references users(id),
  updated_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_key, connection_id, project_id)
);

create index if not exists idx_google_ads_sync_locks_lease
  on google_ads_sync_locks(provider_key, connection_id, project_id, locked_until desc);

create table if not exists google_ads_sync_checkpoints (
  id uuid primary key,
  provider_key text not null,
  connection_id uuid not null references google_oauth_connections(id),
  customer_id text not null,
  checkpoint_key text not null,
  checkpoint_version integer not null default 1,
  checkpoint_state jsonb not null default '{}'::jsonb,
  last_record_date date,
  sync_run_id uuid references google_ads_sync_runs(id) on delete set null,
  status varchar(32) not null default 'in_progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_ads_sync_checkpoints_status_check check (status in ('in_progress', 'completed')),
  unique (provider_key, connection_id, customer_id, checkpoint_key)
);

create index if not exists idx_google_ads_sync_checkpoints_lookup
  on google_ads_sync_checkpoints(provider_key, connection_id, customer_id, checkpoint_version desc, updated_at desc);

create table if not exists google_ads_sync_cursors (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id),
  customer_id text not null,
  entity_type varchar(64) not null,
  last_record_date date,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, customer_id, entity_type)
);
