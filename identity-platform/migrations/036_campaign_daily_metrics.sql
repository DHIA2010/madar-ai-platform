-- Campaign Link / Attribution: analytical aggregation layer.
-- The only tables dashboard/KPI endpoints may query -- never raw tracking_events
-- or order_attributions scans. No spend column: spend is always read live from
-- each ad platform's own tables at aggregation/query time, never entered here.

create table if not exists campaign_daily_metrics (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  campaign_id uuid not null references campaigns(id),
  metric_date date not null,
  clicks integer not null default 0,
  sessions integer not null default 0,
  orders_count integer not null default 0,
  revenue numeric(14, 2) not null default 0,
  currency varchar(8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_campaign_daily_metrics
  on campaign_daily_metrics(campaign_id, metric_date);

create index if not exists idx_campaign_daily_metrics_org
  on campaign_daily_metrics(organization_id, metric_date desc);

create table if not exists campaign_link_daily_metrics (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  campaign_link_id uuid not null references campaign_links(id),
  metric_date date not null,
  clicks integer not null default 0,
  sessions integer not null default 0,
  orders_count integer not null default 0,
  revenue numeric(14, 2) not null default 0,
  currency varchar(8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_campaign_link_daily_metrics
  on campaign_link_daily_metrics(campaign_link_id, metric_date);

create index if not exists idx_campaign_link_daily_metrics_org
  on campaign_link_daily_metrics(organization_id, metric_date desc);
