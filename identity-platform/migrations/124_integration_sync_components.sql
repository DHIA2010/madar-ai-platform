-- Which data an e-commerce connection (Salla, Zid, Shopify) keeps syncing -- chosen in the connect
-- wizard and editable afterwards. No row means everything is on. Turning a component off stops
-- syncs and webhooks updating it; what was already synced stays.
create table if not exists integration_sync_components (
  provider varchar(16) not null,
  connection_id uuid not null,
  products boolean not null default true,
  orders boolean not null default true,
  customers boolean not null default true,
  updated_by_user_id uuid,
  updated_at timestamptz not null default now(),
  primary key (provider, connection_id),
  constraint integration_sync_components_provider_check
    check (provider in ('salla', 'zid', 'shopify'))
);
