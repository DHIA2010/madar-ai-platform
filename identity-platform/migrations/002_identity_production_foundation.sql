alter table users
  add column if not exists primary_organization_id uuid references organizations(id),
  add column if not exists active_workspace_id uuid references workspaces(id);

alter table memberships
  add column if not exists updated_at timestamptz not null default now();

alter table organizations
  add column if not exists branding jsonb not null default '{}'::jsonb,
  add column if not exists logo_url text,
  add column if not exists timezone varchar(64) not null default 'UTC',
  add column if not exists locale varchar(16) not null default 'en',
  add column if not exists currency varchar(16) not null default 'USD',
  add column if not exists subscription_reference text;

alter table organizations
  drop constraint if exists organizations_status_check;

alter table organizations
  add constraint organizations_status_check
  check (status in ('active', 'archived', 'deleted'));

alter table memberships
  add column if not exists status varchar(32) not null default 'active',
  add column if not exists status_reason text,
  add column if not exists invited_by_user_id uuid references users(id),
  add column if not exists accepted_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists removed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists history jsonb not null default '[]'::jsonb,
  add column if not exists role_history jsonb not null default '[]'::jsonb;

alter table memberships
  drop constraint if exists memberships_status_check;

alter table memberships
  add constraint memberships_status_check
  check (status in ('invited', 'active', 'suspended', 'removed'));

alter table organization_invitations
  alter column workspace_id drop not null,
  add column if not exists status varchar(32) not null default 'pending',
  add column if not exists idempotency_key varchar(100),
  add column if not exists declined_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists last_sent_at timestamptz not null default now(),
  add column if not exists resend_count integer not null default 0;

update organization_invitations
set idempotency_key = coalesce(idempotency_key, id::text)
where idempotency_key is null;

alter table organization_invitations
  alter column idempotency_key set not null;

alter table organization_invitations
  drop constraint if exists organization_invitations_status_check;

alter table organization_invitations
  add constraint organization_invitations_status_check
  check (status in ('pending', 'accepted', 'declined', 'canceled', 'expired'));

create unique index if not exists uq_organization_invitations_org_idempotency_pending
  on organization_invitations (organization_id, idempotency_key)
  where status = 'pending' and deleted_at is null;

create index if not exists idx_organization_invitations_status_expiry
  on organization_invitations (status, expires_at);

create index if not exists idx_memberships_org_status
  on memberships (organization_id, status)
  where deleted_at is null;

create table if not exists outbox_events (
  id uuid primary key,
  event_type varchar(150) not null,
  event_version integer not null,
  aggregate_type varchar(100) not null,
  aggregate_id uuid not null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  status varchar(32) not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_outbox_events_status_created_at on outbox_events(status, created_at);
create index if not exists idx_outbox_events_aggregate on outbox_events(aggregate_type, aggregate_id);

create table if not exists feature_flags (
  id uuid primary key,
  flag_key varchar(150) not null,
  scope_type varchar(50) not null default 'global',
  scope_id uuid,
  enabled boolean not null,
  rollout_percentage integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flag_key, scope_type, scope_id)
);

create index if not exists idx_feature_flags_lookup on feature_flags(flag_key, scope_type, scope_id);