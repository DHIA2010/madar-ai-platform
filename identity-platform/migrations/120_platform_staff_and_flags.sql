-- Madar's own staff, managed from Madar Admin instead of only the PLATFORM_ADMIN_EMAILS env
-- allowlist (which keeps working: those emails are permanent Super Admins). A staff member is a
-- regular Madar user given one of a fixed set of roles; disabling one removes Madar Admin access
-- without touching their own account.
create table if not exists platform_staff (
  user_id uuid primary key references users(id),
  role varchar(24) not null,
  status varchar(16) not null default 'active',
  added_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_staff_role_check
    check (role in ('super_admin', 'operations', 'finance', 'support')),
  constraint platform_staff_status_check check (status in ('active', 'disabled'))
);

-- Feature flags already had a table (002) that nothing used; Madar Admin now manages it. A flag
-- is its global row (scope_type 'global') plus any per-customer overrides (scope_type
-- 'organization', scope_id = the organization).
alter table feature_flags add column if not exists description text;
