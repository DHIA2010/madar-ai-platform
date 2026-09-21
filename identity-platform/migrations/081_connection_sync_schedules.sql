-- Per-connection automatic sync scheduling. Connections live in separate per-provider tables
-- (snapchat_oauth_connections, salla_oauth_connections, ...), so this keys on (provider_id,
-- connection_id) as a soft reference -- same discriminator-pair pattern outbox_events already
-- uses for aggregate_type/aggregate_id -- rather than a hard FK to any one of them.
create table if not exists connection_sync_schedules (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  provider_id text not null,
  connection_id uuid not null,
  enabled boolean not null default true,
  -- One of frequency_minutes (15/30/60/360/1440 from the preset buttons) or custom_cron (the
  -- "مخصص" option) is set, never both -- custom_cron is a standard 5-field cron expression
  -- evaluated in `timezone` below.
  frequency_minutes integer,
  custom_cron text,
  -- 0=Sunday .. 6=Saturday, matching JS Date#getDay() so the scheduler and the day-chip UI
  -- agree on indexing without a translation table.
  active_days smallint[] not null default '{0,1,2,3,4,5,6}',
  start_time_local time not null default '00:00',
  timezone text not null default 'Asia/Riyadh',
  retry_on_connection_failure boolean not null default true,
  retry_max_attempts integer not null default 3,
  notify_on_failure boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_run_status varchar(32),
  created_by_user_id uuid not null references users(id),
  updated_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_sync_schedules_frequency_check check (
    (frequency_minutes is not null and custom_cron is null)
    or (frequency_minutes is null and custom_cron is not null)
  ),
  constraint connection_sync_schedules_retry_attempts_check check (retry_max_attempts between 0 and 10),
  constraint connection_sync_schedules_last_run_status_check check (
    last_run_status is null or last_run_status in ('completed', 'failed')
  )
);

create unique index if not exists uq_connection_sync_schedules_connection
  on connection_sync_schedules(provider_id, connection_id);

create index if not exists idx_connection_sync_schedules_due
  on connection_sync_schedules(next_run_at)
  where enabled = true;

create index if not exists idx_connection_sync_schedules_org
  on connection_sync_schedules(organization_id);

-- Incremental cursor for Snapchat's daily-stats fetch, mirroring google_ads_sync_cursors --
-- lets a scheduled sync fetch only the days since the last successful run instead of always
-- re-walking the fixed 2025-01-01-to-now window (see sync-service.ts's STATS_HISTORY_START_*
-- comment, which flagged this exact gap).
create table if not exists snapchat_sync_cursors (
  id uuid primary key,
  connection_id uuid not null references snapchat_oauth_connections(id),
  customer_id text not null,
  entity_type varchar(64) not null,
  last_record_date date,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, customer_id, entity_type)
);

-- A real, queryable record of a scheduled sync failure, written only when the schedule that
-- failed has notify_on_failure = true. This is intentionally a standalone table rather than
-- routed through the header notification bell (src/components/notification-dropdown.tsx),
-- which today renders hardcoded demo data with no backend of its own -- wiring that dropdown to
-- real data across the whole app is a separate, wider piece of work than sync scheduling.
create table if not exists schedule_failure_alerts (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  provider_id text not null,
  connection_id uuid not null,
  schedule_id uuid not null references connection_sync_schedules(id) on delete cascade,
  error_code text,
  error_message text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_failure_alerts_org
  on schedule_failure_alerts(organization_id, created_at desc);

create index if not exists idx_schedule_failure_alerts_schedule
  on schedule_failure_alerts(schedule_id, created_at desc);
