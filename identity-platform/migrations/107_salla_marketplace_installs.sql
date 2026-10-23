-- Salla App Store-initiated install ("Install" from inside Salla's own App Store). Salla's Easy
-- Mode (mandatory for App Store-published apps) delivers the exchanged access/refresh token via
-- the app.store.authorize webhook, not a browser redirect with a code -- so, like
-- zid_marketplace_installs, the result lands here unattached to any MADAR organization until a
-- logged-in merchant claims it. raw_webhook_payload is kept for forensics: Salla's documented
-- payload shape for this event is thin/inconsistent across its own docs, so the first real
-- deliveries are what will confirm/correct the field-parsing in handleAppStoreInstall.

create table if not exists salla_marketplace_installs (
  id uuid primary key,
  -- Hashed, not plaintext -- same reasoning as zid_marketplace_installs.claim_token_hash: this is
  -- a bearer credential for a row holding live encrypted Salla access/refresh tokens.
  claim_token_hash text not null unique,
  status varchar(32) not null default 'unclaimed',
  salla_store_external_id text not null,
  salla_store_name text,
  salla_store_domain text,
  salla_store_currency text,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  scopes jsonb not null default '[]'::jsonb,
  token_expires_at timestamptz,
  raw_webhook_payload jsonb,
  claimed_by_user_id uuid references users(id),
  claimed_organization_id uuid references organizations(id),
  claimed_workspace_id uuid references workspaces(id),
  -- No FK to projects(id), deliberately -- matches the existing precedent on
  -- zid_marketplace_installs.claimed_project_id / salla_oauth_connections.project_id.
  claimed_project_id uuid,
  claimed_connection_id uuid references salla_oauth_connections(id),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salla_marketplace_installs_status_check check (status in ('unclaimed', 'claimed', 'expired'))
);

create index if not exists idx_salla_marketplace_installs_status on salla_marketplace_installs(status);
create index if not exists idx_salla_marketplace_installs_created_at on salla_marketplace_installs(created_at);
