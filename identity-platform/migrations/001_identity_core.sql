-- MADAR Identity Platform Core Schema
-- Migration order: 001

create table if not exists users (
  id uuid primary key,
  email varchar(320) not null unique,
  password_hash text not null,
  full_name varchar(200) not null,
  avatar_url text,
  timezone varchar(64) not null default 'UTC',
  language varchar(16) not null default 'en',
  account_status varchar(32) not null default 'active',
  email_verified_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_users_account_status on users(account_status);
create index if not exists idx_users_deleted_at on users(deleted_at);

create table if not exists organizations (
  id uuid primary key,
  name varchar(200) not null,
  owner_user_id uuid not null references users(id),
  status varchar(32) not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_organizations_owner on organizations(owner_user_id);
create index if not exists idx_organizations_status on organizations(status);

create table if not exists workspaces (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name varchar(200) not null,
  status varchar(32) not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_workspaces_org on workspaces(organization_id);
create index if not exists idx_workspaces_status on workspaces(status);

create table if not exists roles (
  id uuid primary key,
  code varchar(50) not null unique,
  name varchar(100) not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key,
  code varchar(100) not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists role_permissions (
  role_id uuid not null references roles(id),
  permission_id uuid not null references permissions(id),
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists memberships (
  id uuid primary key,
  user_id uuid not null references users(id),
  organization_id uuid not null references organizations(id),
  workspace_id uuid not null references workspaces(id),
  role_id uuid references roles(id),
  role_code varchar(50) not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, workspace_id)
);

create index if not exists idx_memberships_org on memberships(organization_id);
create index if not exists idx_memberships_workspace on memberships(workspace_id);

create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null references users(id),
  user_agent text,
  ip_address inet,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_sessions_revoked on sessions(revoked_at);

create table if not exists refresh_tokens (
  id uuid primary key,
  session_id uuid not null references sessions(id),
  user_id uuid not null references users(id),
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  replaced_by_token_id uuid,
  deleted_at timestamptz
);

create index if not exists idx_refresh_tokens_session on refresh_tokens(session_id);
create index if not exists idx_refresh_tokens_user on refresh_tokens(user_id);

create table if not exists email_verifications (
  id uuid primary key,
  user_id uuid not null references users(id),
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_email_verifications_user on email_verifications(user_id);

create table if not exists password_reset_tokens (
  id uuid primary key,
  user_id uuid not null references users(id),
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_password_reset_user on password_reset_tokens(user_id);

create table if not exists organization_invitations (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid not null references workspaces(id),
  email varchar(320) not null,
  role_code varchar(50) not null,
  invited_by_user_id uuid not null references users(id),
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_org_invites_org on organization_invitations(organization_id);
create index if not exists idx_org_invites_workspace on organization_invitations(workspace_id);

create table if not exists audit_logs (
  id uuid primary key,
  actor_user_id uuid references users(id),
  organization_id uuid references organizations(id),
  workspace_id uuid references workspaces(id),
  action varchar(150) not null,
  entity_type varchar(100) not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_org_time on audit_logs(organization_id, created_at desc);
create index if not exists idx_audit_logs_workspace_time on audit_logs(workspace_id, created_at desc);
create index if not exists idx_audit_logs_actor_time on audit_logs(actor_user_id, created_at desc);
