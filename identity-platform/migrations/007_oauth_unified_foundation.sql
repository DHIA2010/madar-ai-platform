create table if not exists oauth_accounts (
  id uuid primary key,
  provider_family text not null,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  provider_subject_id text,
  provider_email text,
  provider_display_name text,
  granted_scopes jsonb not null default '[]'::jsonb,
  status varchar(32) not null default 'pending',
  last_authenticated_at timestamptz,
  created_by_user_id uuid not null references users(id),
  updated_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint oauth_accounts_provider_family_check check (provider_family in ('google', 'snapchat')),
  constraint oauth_accounts_status_check check (status in ('pending', 'active', 'disabled', 'revoked'))
);

create index if not exists idx_oauth_accounts_org on oauth_accounts(organization_id);
create index if not exists idx_oauth_accounts_workspace on oauth_accounts(workspace_id);

create table if not exists oauth_tokens (
  id uuid primary key,
  oauth_account_id uuid not null references oauth_accounts(id) on delete cascade,
  encrypted_refresh_token text,
  encrypted_access_token text,
  token_type text,
  token_expires_at timestamptz,
  refresh_token_issued_at timestamptz,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint oauth_tokens_status_check check (status in ('active', 'revoked', 'expired'))
);

create index if not exists idx_oauth_tokens_account_status on oauth_tokens(oauth_account_id, status, updated_at desc);

create table if not exists integration_connections (
  id uuid primary key,
  provider_id text not null,
  provider_family text not null,
  platform text not null,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  project_id uuid not null,
  oauth_account_id uuid references oauth_accounts(id),
  data_source_id uuid,
  connection_reference text,
  configuration jsonb not null default '{}'::jsonb,
  status varchar(32) not null,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  last_synced_at timestamptz,
  created_by_user_id uuid not null references users(id),
  updated_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint integration_connections_status_check check (status in ('pending', 'connected', 'disconnected', 'error'))
);

create unique index if not exists uq_integration_connections_project_provider
  on integration_connections(project_id, provider_id)
  where deleted_at is null;

create index if not exists idx_integration_connections_org on integration_connections(organization_id);
create index if not exists idx_integration_connections_workspace on integration_connections(workspace_id);
create index if not exists idx_integration_connections_oauth_account on integration_connections(oauth_account_id);

create table if not exists oauth_states (
  id uuid primary key,
  state text not null unique,
  provider_family text not null,
  provider_product text not null,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  project_id uuid not null,
  user_id uuid not null references users(id),
  oauth_account_id uuid not null references oauth_accounts(id),
  connection_id uuid not null references integration_connections(id),
  requested_scopes jsonb not null default '[]'::jsonb,
  redirect_uri text not null,
  status varchar(32) not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oauth_states_provider_family_check check (provider_family in ('google', 'snapchat')),
  constraint oauth_states_status_check check (status in ('pending', 'consumed', 'expired'))
);

create index if not exists idx_oauth_states_connection on oauth_states(connection_id);
create index if not exists idx_oauth_states_oauth_account on oauth_states(oauth_account_id);
create index if not exists idx_oauth_states_expires_at on oauth_states(expires_at);

insert into oauth_accounts (
  id,
  provider_family,
  organization_id,
  workspace_id,
  provider_subject_id,
  provider_email,
  provider_display_name,
  granted_scopes,
  status,
  last_authenticated_at,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  deleted_at
)
select
  g.id,
  'google' as provider_family,
  g.organization_id,
  g.workspace_id,
  g.provider_account_id,
  g.provider_account_email,
  g.provider_account_name,
  coalesce(g.scopes, '[]'::jsonb),
  case when g.status = 'connected' then 'active' else 'pending' end,
  g.last_connected_at,
  g.created_by_user_id,
  g.updated_by_user_id,
  g.created_at,
  g.updated_at,
  g.deleted_at
from google_oauth_connections g
left join oauth_accounts oa_existing
  on oa_existing.id = g.id
where oa_existing.id is null;

insert into integration_connections (
  id,
  provider_id,
  provider_family,
  platform,
  organization_id,
  workspace_id,
  project_id,
  oauth_account_id,
  data_source_id,
  connection_reference,
  configuration,
  status,
  last_connected_at,
  last_disconnected_at,
  last_synced_at,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  deleted_at
)
select
  g.id,
  'google-ads' as provider_id,
  'google' as provider_family,
  'marketing' as platform,
  g.organization_id,
  g.workspace_id,
  g.project_id,
  g.id as oauth_account_id,
  g.data_source_id,
  g.connection_reference,
  '{}'::jsonb,
  g.status,
  g.last_connected_at,
  g.last_disconnected_at,
  null as last_synced_at,
  g.created_by_user_id,
  g.updated_by_user_id,
  g.created_at,
  g.updated_at,
  g.deleted_at
from google_oauth_connections g
left join integration_connections ic_existing
  on ic_existing.id = g.id
  or (
    ic_existing.project_id = g.project_id
    and ic_existing.provider_id = 'google-ads'
    and ic_existing.deleted_at is null
  )
where ic_existing.id is null;

insert into oauth_states (
  id,
  state,
  provider_family,
  provider_product,
  organization_id,
  workspace_id,
  project_id,
  user_id,
  oauth_account_id,
  connection_id,
  requested_scopes,
  redirect_uri,
  status,
  expires_at,
  consumed_at,
  created_at,
  updated_at
)
select
  s.id,
  s.state,
  'google' as provider_family,
  'ads' as provider_product,
  s.organization_id,
  s.workspace_id,
  s.project_id,
  s.user_id,
  s.connection_id as oauth_account_id,
  coalesce(ic_direct.id, ic_project.id) as connection_id,
  coalesce(s.requested_scopes, '[]'::jsonb),
  s.redirect_uri,
  s.status,
  s.expires_at,
  s.consumed_at,
  s.created_at,
  s.updated_at
from google_oauth_states s
left join integration_connections ic_direct
  on ic_direct.id = s.connection_id
 and ic_direct.deleted_at is null
left join integration_connections ic_project
  on ic_project.project_id = s.project_id
 and ic_project.provider_id = 'google-ads'
 and ic_project.deleted_at is null
left join oauth_states os_existing
  on os_existing.id = s.id
where os_existing.id is null
and coalesce(ic_direct.id, ic_project.id) is not null;
