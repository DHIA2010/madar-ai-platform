create table if not exists connectors (
  id uuid primary key,
  connector_id text not null unique,
  display_name text not null,
  description text not null default '',
  version text not null default '1.0.0',
  status text not null,
  capabilities jsonb not null default '[]'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists connections (
  id uuid primary key,
  connector_id text not null references connectors(connector_id),
  organization_id uuid not null,
  workspace_id uuid,
  project_id uuid,
  status text not null,
  credential_id uuid,
  oauth_session_id uuid,
  provider_account_id text,
  provider_email text,
  capabilities jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists oauth_sessions (
  id uuid primary key,
  connector_id text not null references connectors(connector_id),
  connection_id uuid not null references connections(id),
  state text not null unique,
  code_verifier text,
  code_challenge text,
  redirect_uri text not null,
  scopes jsonb not null default '[]'::jsonb,
  status text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists oauth_tokens (
  id uuid primary key,
  connection_id uuid not null references connections(id),
  provider_account_id text,
  provider_email text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_type text not null,
  scopes jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  issued_at timestamptz not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists credentials (
  id uuid primary key,
  connection_id uuid not null references connections(id),
  version integer not null,
  status text not null,
  secret_ciphertext text not null,
  secret_metadata jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  rotated_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists sync_jobs (
  id uuid primary key,
  connection_id uuid not null references connections(id),
  connector_id text not null references connectors(connector_id),
  mode text not null,
  status text not null,
  progress integer not null default 0,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists connector_health (
  id uuid primary key,
  connector_id text not null references connectors(connector_id),
  connection_id uuid,
  status text not null,
  message text not null,
  retry_count integer not null default 0,
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists connector_configurations (
  id uuid primary key,
  connector_id text not null references connectors(connector_id),
  connection_id uuid,
  version integer not null,
  configuration jsonb not null default '{}'::jsonb,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists webhook_registrations (
  id uuid primary key,
  connector_id text not null references connectors(connector_id),
  connection_id uuid not null references connections(id),
  endpoint_url text not null,
  secret_ciphertext text not null,
  signature_header text not null,
  replay_window_seconds integer not null default 300,
  status text not null,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create index if not exists idx_connections_organization_id on connections(organization_id);
create index if not exists idx_connections_workspace_id on connections(workspace_id);
create index if not exists idx_sync_jobs_connection_id on sync_jobs(connection_id);
