create table if not exists google_ads_campaigns (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id) on delete cascade,
  customer_id text not null,
  campaign_id text not null,
  name text not null,
  status text not null,
  channel_type text,
  bidding_strategy_type text,
  budget_micros bigint,
  start_date date,
  end_date date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, customer_id, campaign_id)
);

create index if not exists idx_google_ads_campaigns_connection_customer
  on google_ads_campaigns(connection_id, customer_id, updated_at desc);

create table if not exists google_ads_ad_groups (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id) on delete cascade,
  customer_id text not null,
  ad_group_id text not null,
  campaign_id text not null,
  name text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, customer_id, ad_group_id)
);

create index if not exists idx_google_ads_ad_groups_connection_customer
  on google_ads_ad_groups(connection_id, customer_id, updated_at desc);

create table if not exists google_ads_ads (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id) on delete cascade,
  customer_id text not null,
  ad_id text not null,
  campaign_id text,
  ad_group_id text,
  status text not null,
  ad_type text not null,
  headline text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, customer_id, ad_id)
);

create index if not exists idx_google_ads_ads_connection_customer
  on google_ads_ads(connection_id, customer_id, updated_at desc);

create table if not exists google_ads_keywords (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id) on delete cascade,
  customer_id text not null,
  keyword_id text not null,
  campaign_id text,
  ad_group_id text,
  keyword_text text not null,
  match_type text,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, customer_id, keyword_id)
);

create index if not exists idx_google_ads_keywords_connection_customer
  on google_ads_keywords(connection_id, customer_id, updated_at desc);

create table if not exists google_ads_conversion_actions (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id) on delete cascade,
  customer_id text not null,
  conversion_action_id text not null,
  name text not null,
  category text,
  status text not null,
  action_type text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, customer_id, conversion_action_id)
);

create index if not exists idx_google_ads_conversion_actions_connection_customer
  on google_ads_conversion_actions(connection_id, customer_id, updated_at desc);

create table if not exists google_ads_daily_metrics (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id) on delete cascade,
  sync_run_id uuid not null references google_ads_sync_runs(id) on delete cascade,
  customer_id text not null,
  metric_scope text not null,
  metric_entity_id text not null,
  campaign_id text,
  ad_group_id text,
  ad_id text,
  keyword_id text,
  metric_date date not null,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric(12,6) not null default 0,
  cost_micros bigint not null default 0,
  average_cpc bigint not null default 0,
  average_cpm bigint not null default 0,
  conversions numeric(18,6) not null default 0,
  conversion_value numeric(18,6) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_ads_daily_metrics_scope_check check (
    metric_scope in ('campaign', 'ad_group', 'ad', 'keyword', 'search_term', 'geo', 'device')
  ),
  unique (connection_id, customer_id, metric_scope, metric_entity_id, metric_date)
);

create index if not exists idx_google_ads_daily_metrics_connection_date
  on google_ads_daily_metrics(connection_id, customer_id, metric_date desc);
