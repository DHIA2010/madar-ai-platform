-- Campaign Link / Attribution: order-side matching results.
-- Not a duplicate order model -- orders themselves stay read live from each
-- provider's *_records tables (see OrdersAggregationService). This table only
-- records the resolved attribution outcome for a given external order, keyed
-- so a failed or unmatched order can safely land as UNATTRIBUTED rather than
-- being force-matched or blocking order ingestion.

create table if not exists order_attributions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  provider varchar(16) not null,
  connection_id uuid not null,
  external_order_id text not null,
  order_created_at timestamptz not null,
  currency varchar(8),
  total_amount numeric(14, 2),
  customer_ref text,
  attribution_id uuid references attributions(id),
  campaign_id uuid references campaigns(id),
  campaign_link_id uuid references campaign_links(id),
  match_method varchar(24) not null,
  model_used varchar(16) not null default 'LAST_CLICK',
  attribution_status varchar(16) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_attributions_provider_check check (provider in ('salla', 'shopify', 'zid')),
  constraint order_attributions_match_method_check check (
    match_method in ('explicit_id', 'campaign_link_id', 'session_id', 'customer_ref', 'utm_match', 'unattributed')
  ),
  constraint order_attributions_model_check check (
    model_used in ('LAST_CLICK', 'FIRST_CLICK', 'LINEAR', 'TIME_DECAY', 'DATA_DRIVEN')
  ),
  constraint order_attributions_status_check check (attribution_status in ('ATTRIBUTED', 'UNATTRIBUTED'))
);

-- Idempotent re-matching: re-running matchOrders for the same order updates
-- the existing row instead of creating a duplicate.
create unique index if not exists uq_order_attributions_order
  on order_attributions(provider, connection_id, external_order_id);

create index if not exists idx_order_attributions_org_time on order_attributions(organization_id, order_created_at desc);
create index if not exists idx_order_attributions_campaign_link on order_attributions(campaign_link_id, order_created_at desc);
create index if not exists idx_order_attributions_campaign on order_attributions(campaign_id, order_created_at desc);
create index if not exists idx_order_attributions_status on order_attributions(attribution_status);
