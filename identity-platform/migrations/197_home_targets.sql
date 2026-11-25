-- The targets on the home page's three tabs (ads, online stores, point of sale): one number per
-- KPI, per organization, and which KPI each tab shows. Shared by the whole team.
create table if not exists home_targets (
  organization_id uuid not null,
  scope varchar(16) not null,
  kpi varchar(40) not null,
  target numeric(18, 4) not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (organization_id, scope, kpi)
);

create table if not exists home_target_choices (
  organization_id uuid not null,
  scope varchar(16) not null,
  kpi varchar(40) not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, scope)
);
