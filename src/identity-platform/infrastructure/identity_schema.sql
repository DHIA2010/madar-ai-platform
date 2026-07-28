-- Sprint 3 Identity Platform schema (PostgreSQL)
-- Covers users, organizations, workspaces, memberships, roles, permissions,
-- sessions, refresh token rotation, verification/reset tokens, and audit logs.

create extension if not exists pgcrypto;

create table if not exists identity_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  full_name text not null,
  avatar_url text,
  timezone text not null default 'UTC',
  language text not null default 'en',
  status text not null check (status in ('active', 'locked', 'pending_verification', 'disabled')),
  email_verified_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  failed_login_attempts integer not null default 0,
  lockout_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uq_identity_users_email unique (email)
);

create index if not exists idx_identity_users_email_active
  on identity_users (lower(email))
  where deleted_at is null;

create table if not exists identity_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references identity_users(id),
  status text not null check (status in ('active', 'suspended', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_identity_organizations_owner
  on identity_organizations (owner_user_id)
  where deleted_at is null;

create table if not exists identity_workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references identity_organizations(id),
  name text not null,
  status text not null check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_identity_workspaces_org
  on identity_workspaces (organization_id)
  where deleted_at is null;

create table if not exists identity_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uq_identity_roles_code unique (code)
);

create table if not exists identity_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uq_identity_permissions_code unique (code)
);

create table if not exists identity_role_permissions (
  role_id uuid not null references identity_roles(id),
  permission_id uuid not null references identity_permissions(id),
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists identity_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references identity_organizations(id),
  workspace_id uuid references identity_workspaces(id),
  user_id uuid not null references identity_users(id),
  role_id uuid not null references identity_roles(id),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended', 'removed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_identity_memberships_unique_active
  on identity_memberships (organization_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id, role_id)
  where deleted_at is null;

create index if not exists idx_identity_memberships_user
  on identity_memberships (user_id)
  where deleted_at is null;

create table if not exists identity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity_users(id),
  organization_id uuid not null references identity_organizations(id),
  workspace_id uuid references identity_workspaces(id),
  refresh_token_hash text not null,
  refresh_token_family uuid not null,
  remember_me boolean not null default false,
  user_agent text not null,
  ip_address text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_identity_sessions_refresh_hash
  on identity_sessions (refresh_token_hash)
  where deleted_at is null;

create index if not exists idx_identity_sessions_user_active
  on identity_sessions (user_id, revoked_at, expires_at)
  where deleted_at is null;

create table if not exists identity_email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity_users(id),
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_identity_email_verification_token_hash unique (token_hash)
);

create table if not exists identity_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity_users(id),
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_identity_password_reset_token_hash unique (token_hash)
);

create table if not exists identity_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references identity_users(id),
  organization_id uuid references identity_organizations(id),
  workspace_id uuid references identity_workspaces(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  ip_address text not null,
  user_agent text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_identity_audit_logs_actor_date
  on identity_audit_logs (actor_user_id, created_at desc);

create index if not exists idx_identity_audit_logs_org_date
  on identity_audit_logs (organization_id, created_at desc);
