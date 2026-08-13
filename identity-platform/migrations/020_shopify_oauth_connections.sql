create table if not exists shopify_oauth_connections (
  id uuid primary key,
  provider text not null default 'shopify',
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  project_id uuid not null,
  data_source_id uuid,
  -- Shopify's OAuth is store-scoped: every authorize/token/API call targets
  -- https://{shop_domain}/... rather than a single global endpoint, so the shop domain
  -- has to be known before the redirect is even built (unlike every other connector here).
  shop_domain text not null,
  provider_account_id text,
  provider_account_name text,
  provider_account_email text,
  encrypted_refresh_token text,
  encrypted_access_token text,
  scopes jsonb not null default '[]'::jsonb,
  token_expires_at timestamptz,
  status varchar(32) not null default 'pending',
  connection_reference text,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  created_by_user_id uuid not null references users(id),
  updated_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint shopify_oauth_connections_status_check check (status in ('pending', 'connected', 'paused', 'disconnected', 'error')),
  constraint shopify_oauth_connections_provider_check check (provider = 'shopify')
);

create unique index if not exists uq_shopify_oauth_connections_project_provider
  on shopify_oauth_connections(project_id, provider)
  where deleted_at is null;

create index if not exists idx_shopify_oauth_connections_org on shopify_oauth_connections(organization_id);
create index if not exists idx_shopify_oauth_connections_workspace on shopify_oauth_connections(workspace_id);
create index if not exists idx_shopify_oauth_connections_project on shopify_oauth_connections(project_id);
create index if not exists idx_shopify_oauth_connections_status on shopify_oauth_connections(status);
create index if not exists idx_shopify_oauth_connections_shop_domain on shopify_oauth_connections(shop_domain);

create table if not exists shopify_oauth_states (
  id uuid primary key,
  state text not null unique,
  provider text not null default 'shopify',
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  project_id uuid not null,
  user_id uuid not null references users(id),
  connection_id uuid not null references shopify_oauth_connections(id),
  shop_domain text not null,
  requested_scopes jsonb not null default '[]'::jsonb,
  redirect_uri text not null,
  status varchar(32) not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopify_oauth_states_status_check check (status in ('pending', 'consumed', 'expired')),
  constraint shopify_oauth_states_provider_check check (provider = 'shopify')
);

create index if not exists idx_shopify_oauth_states_connection on shopify_oauth_states(connection_id);
create index if not exists idx_shopify_oauth_states_expires_at on shopify_oauth_states(expires_at);

create table if not exists shopify_oauth_events (
  id uuid primary key,
  connection_id uuid not null references shopify_oauth_connections(id),
  event_type varchar(120) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_shopify_oauth_events_connection_time
  on shopify_oauth_events(connection_id, created_at desc);

-- Shopify's OAuth authorizes exactly one store per connection (like Salla), so this table
-- holds a single row per connection -- kept as its own table anyway for the same
-- ProviderAccountDiscoveryRepository shape every other connector already implements.
create table if not exists shopify_stores (
  id uuid primary key,
  connection_id uuid not null references shopify_oauth_connections(id),
  account_id text not null,
  account_name text,
  currency_code text,
  time_zone text,
  organization_id text,
  organization_name text,
  status varchar(32) not null default 'active',
  is_selected boolean not null default false,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopify_stores_status_check check (status in ('active', 'inactive')),
  constraint uq_shopify_store unique (connection_id, account_id)
);

create index if not exists idx_shopify_stores_connection on shopify_stores(connection_id);
create index if not exists idx_shopify_stores_status on shopify_stores(status);
