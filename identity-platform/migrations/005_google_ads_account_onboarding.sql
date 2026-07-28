create table if not exists google_ads_customer_accounts (
  id uuid primary key,
  connection_id uuid not null references google_oauth_connections(id) on delete cascade,
  customer_id text not null,
  display_name text,
  currency_code text,
  time_zone text,
  status varchar(32) not null default 'active',
  is_selected boolean not null default false,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_ads_customer_accounts_status_check check (status in ('active', 'inactive')),
  unique (connection_id, customer_id)
);

create index if not exists idx_google_ads_customer_accounts_connection
  on google_ads_customer_accounts(connection_id, status, is_selected desc, updated_at desc);
