-- Custom roles: org-scoped, granular per-module permission matrices, additive
-- to (not replacing) the existing fixed owner/admin/manager/analyst/viewer
-- membership role system, which continues to gate all platform authorization.
-- Migration order: 014

create table if not exists custom_roles (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name varchar(200) not null,
  description text not null default '',
  created_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_custom_roles_org on custom_roles(organization_id);

create table if not exists custom_role_permissions (
  id uuid primary key,
  role_id uuid not null references custom_roles(id),
  module varchar(50) not null,
  action varchar(50) not null,
  created_at timestamptz not null default now(),
  unique (role_id, module, action)
);

create index if not exists idx_custom_role_permissions_role on custom_role_permissions(role_id);
