create table if not exists projects (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  owner_user_id uuid not null references users(id),
  name varchar(200) not null,
  status varchar(32) not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  logo_url text,
  timezone varchar(64) not null default 'UTC',
  currency varchar(16) not null default 'USD',
  locale varchar(16) not null default 'en',
  environment varchar(32) not null default 'production',
  settings jsonb not null default '{}'::jsonb,
  retention_policy text,
  default_dashboard text,
  notification_preferences jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  connector_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint projects_status_check check (status in ('active', 'archived', 'deleted')),
  constraint projects_environment_check check (environment in ('development', 'staging', 'production', 'sandbox'))
);

create index if not exists idx_projects_org on projects(organization_id);
create index if not exists idx_projects_workspace on projects(workspace_id);
create index if not exists idx_projects_status on projects(status);

create table if not exists project_members (
  id uuid primary key,
  project_id uuid not null references projects(id),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  organization_role varchar(50) not null,
  project_role varchar(50) not null,
  access_policy varchar(32) not null default 'inherited',
  permissions jsonb not null default '{}'::jsonb,
  status varchar(32) not null default 'active',
  status_reason text,
  invited_by_user_id uuid references users(id),
  accepted_at timestamptz,
  suspended_at timestamptz,
  removed_at timestamptz,
  history jsonb not null default '[]'::jsonb,
  role_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_members_status_check check (status in ('invited', 'active', 'suspended', 'removed')),
  constraint project_members_access_policy_check check (access_policy in ('inherited', 'custom', 'restricted'))
);

create unique index if not exists uq_project_members_project_user on project_members(project_id, user_id) where deleted_at is null;
create index if not exists idx_project_members_org on project_members(organization_id);
create index if not exists idx_project_members_project on project_members(project_id);

create table if not exists project_invitations (
  id uuid primary key,
  token text not null unique,
  email varchar(320) not null,
  project_id uuid not null references projects(id),
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  role_code varchar(50) not null,
  invited_by_user_id uuid not null references users(id),
  status varchar(32) not null default 'pending',
  idempotency_key varchar(100) not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  declined_at timestamptz,
  canceled_at timestamptz,
  last_sent_at timestamptz not null default now(),
  resend_count integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_invitations_status_check check (status in ('pending', 'accepted', 'declined', 'canceled', 'expired'))
);

create unique index if not exists uq_project_invitations_project_idempotency_pending
  on project_invitations(project_id, idempotency_key)
  where status = 'pending' and deleted_at is null;
create index if not exists idx_project_invitations_project on project_invitations(project_id);
create index if not exists idx_project_invitations_status on project_invitations(status, expires_at);

create table if not exists data_sources (
  id uuid primary key,
  project_id uuid not null references projects(id),
  organization_id uuid not null references organizations(id),
  name varchar(200) not null,
  type varchar(64) not null,
  status varchar(32) not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  validation_status varchar(32) not null default 'pending',
  health_status varchar(32) not null default 'unknown',
  sync_status varchar(32) not null default 'pending',
  connection_status varchar(32) not null default 'not_applicable',
  future_oauth_ready boolean not null default true,
  connection_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint data_sources_status_check check (status in ('draft', 'enabled', 'disabled', 'archived', 'deleted')),
  constraint data_sources_validation_check check (validation_status in ('pending', 'valid', 'invalid')),
  constraint data_sources_health_check check (health_status in ('healthy', 'degraded', 'unhealthy', 'unknown')),
  constraint data_sources_sync_check check (sync_status in ('idle', 'syncing', 'failed', 'disabled', 'pending')),
  constraint data_sources_connection_check check (connection_status in ('connected', 'disconnected', 'pending', 'error', 'not_applicable'))
);

create index if not exists idx_data_sources_project on data_sources(project_id);
create index if not exists idx_data_sources_type on data_sources(type);
create index if not exists idx_data_sources_status on data_sources(status);
