create table if not exists pos_roles (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_pos_roles_org on pos_roles(organization_id) where deleted_at is null;

create unique index if not exists uq_pos_roles_org_name
  on pos_roles(organization_id, lower(name))
  where deleted_at is null;

create table if not exists pos_employees (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  pos_role_id uuid references pos_roles(id),
  full_name text not null,
  email text not null,
  password_hash text not null,
  status varchar(16) not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint pos_employees_status_check check (status in ('active', 'inactive'))
);

-- Globally unique (not per-org) so the login page can look an employee up by email alone,
-- matching how the main `users` table already works -- login never asks which org/store first.
create unique index if not exists uq_pos_employees_email
  on pos_employees(lower(email))
  where deleted_at is null;

create index if not exists idx_pos_employees_org on pos_employees(organization_id) where deleted_at is null;
create index if not exists idx_pos_employees_role on pos_employees(pos_role_id);

create table if not exists pos_employee_sessions (
  id uuid primary key,
  employee_id uuid not null references pos_employees(id),
  organization_id uuid not null references organizations(id),
  revoked_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_employee_sessions_employee on pos_employee_sessions(employee_id);
