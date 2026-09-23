-- The reports/KPI mini-BI engine: users define a KPI (a data source + field + aggregation +
-- filters + time grouping + comparison + display type from a fixed, whitelisted catalog -- see
-- src/identity-platform/reports/catalog.ts, never arbitrary SQL), then compose saved KPIs onto a
-- custom report's canvas. "Ready-made" reports are just is_system = true rows seeded once below,
-- so there is one reporting mechanism, not two.
create table if not exists kpis (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  -- Null = organization-wide KPI, visible regardless of which workspace is active -- mirrors
  -- connection_sync_schedules.workspace_id's own nullable-means-org-wide convention.
  workspace_id uuid references workspaces(id),
  name text not null,
  description text not null default '',
  category text not null,
  data_source text not null,
  field text not null,
  aggregation text not null check (aggregation in ('sum', 'avg', 'count', 'min', 'max')),
  filters jsonb not null default '[]'::jsonb,
  time_grouping text not null default 'month'
    check (time_grouping in ('day', 'week', 'month', 'quarter', 'year', 'none')),
  -- Set only for a breakdown-style KPI (bar/pie/table by category, branch, product, ...) --
  -- mutually exclusive in practice with a meaningful time_grouping: query-builder.ts always
  -- prefers group_by_dimension over time bucketing when both are present.
  group_by_dimension text,
  compare_enabled boolean not null default true,
  compare_against text not null default 'previous_period',
  display_type text not null default 'number'
    check (display_type in ('number', 'line', 'bar', 'pie', 'table', 'gauge')),
  is_system boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'active')),
  created_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kpis_org on kpis(organization_id);

create table if not exists custom_reports (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  name text not null,
  description text not null default '',
  category text not null,
  default_filters jsonb not null default '{}'::jsonb,
  display_options jsonb not null default '{}'::jsonb,
  sharing text not null default 'private' check (sharing in ('private', 'organization')),
  is_system boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'active', 'stopped')),
  created_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_reports_org on custom_reports(organization_id);

-- One row per KPI placed on a report's canvas. A simple single-column stack of cards/charts
-- (position.order) is enough for v1's card+chart grid -- no free x/y placement needed yet.
create table if not exists report_widgets (
  id uuid primary key,
  report_id uuid not null references custom_reports(id) on delete cascade,
  kpi_id uuid not null references kpis(id) on delete cascade,
  position jsonb not null default '{"order": 0}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_report_widgets_report on report_widgets(report_id);
