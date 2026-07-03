create table if not exists google_oauth_connections (
  id uuid primary key,
  provider text not null default 'google_ads',
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  project_id uuid not null,
  data_source_id uuid,
  provider_account_id text,
  provider_account_name text,
  provider_account_email text,
  encrypted_refresh_token text,
  encrypted_access_token text,
  scopes jsonb not null default '[]'::jsonb,
  token_expires_at timestamptz,
  status varchar(32) not null default 'pending',
  connection_reference text,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  created_by_user_id uuid not null references users(id),
  updated_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint google_oauth_connections_status_check check (status in ('pending', 'connected', 'disconnected', 'error')),
  constraint google_oauth_connections_provider_check check (provider = 'google_ads')
);

create unique index if not exists uq_google_oauth_connections_project_provider
  on google_oauth_connections(project_id, provider)
  where deleted_at is null;

create index if not exists idx_google_oauth_connections_org on google_oauth_connections(organization_id);
create index if not exists idx_google_oauth_connections_workspace on google_oauth_connections(workspace_id);
create index if not exists idx_google_oauth_connections_project on google_oauth_connections(project_id);
create index if not exists idx_google_oauth_connections_status on google_oauth_connections(status);

create table if not exists google_oauth_states (
  id uuid primary key,
  state text not null unique,
  provider text not null default 'google_ads',
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  project_id uuid not null,
  user_id uuid not null references users(id),
  connection_id uuid not null references google_oauth_connections(id),
  requested_scopes jsonb not null default '[]'::jsonb,
  redirect_uri text not null,
  status varchar(32) not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_oauth_states_status_check check (status in ('pending', 'consumed', 'expired')),
  constraint google_oauth_states_provider_check check (provider = 'google_ads')
);

create index if not exists idx_google_oauth_states_connection on google_oauth_states(connection_id);
create index if not exists idx_google_oauth_states_expires_at on google_oauth_states(expires_at);

create table if not exists google_oauth_events (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id),
  event_type varchar(120) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_google_oauth_events_connection_time
  on google_oauth_events(connection_id, created_at desc);
