create table if not exists marketing_campaigns (
  id uuid primary key,
  integration_connection_id uuid not null,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  project_id uuid not null,
  provider_id text not null,
  provider_family text not null,
  provider_account_id text not null,
  external_customer_id text not null,
  provider_entity_id text not null,
  name text not null,
  status text not null,
  channel text,
  objective text,
  budget_micros bigint,
  currency_code text,
  start_date date,
  end_date date,
  source_updated_at timestamptz,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_marketing_campaigns_connection_entity
  on marketing_campaigns(integration_connection_id, provider_entity_id);

create index if not exists idx_marketing_campaigns_connection_customer
  on marketing_campaigns(integration_connection_id, external_customer_id);
