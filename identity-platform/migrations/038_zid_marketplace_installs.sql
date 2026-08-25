-- Zid marketplace-initiated install ("Activate" from inside Zid's own Partner Dashboard/App
-- Market). Unlike the admin-initiated connect flow, the merchant here is not logged into MADAR
-- and may not even have an account yet, so the OAuth token exchange completes before any
-- organization is known -- this table holds the exchanged, still-unattached result until the
-- merchant logs in/registers and claims it into an org.

create table if not exists zid_marketplace_installs (
  id uuid primary key,
  -- Hashed, not plaintext, unlike zid_oauth_states/invitations -- this token is a bearer
  -- credential for up to 7 days, for a row that already holds live encrypted Zid access/refresh
  -- tokens (real API access to the merchant's store), a materially higher-stakes secret than an
  -- org-invite or a 10-minute OAuth state. Hashed the same way password-reset tokens are.
  claim_token_hash text not null unique,
  status varchar(32) not null default 'unclaimed',
  zid_store_external_id text not null,
  zid_store_name text,
  zid_store_currency text,
  zid_store_timezone text,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  scopes jsonb not null default '[]'::jsonb,
  token_expires_at timestamptz,
  claimed_by_user_id uuid references users(id),
  claimed_organization_id uuid references organizations(id),
  claimed_workspace_id uuid references workspaces(id),
  -- No FK to projects(id), deliberately -- matches the existing precedent on
  -- zid_oauth_connections.project_id/zid_oauth_states.project_id, which also have none (project
  -- migrations live in a separate project-platform migration set with no guaranteed ordering
  -- against identity-platform's).
  claimed_project_id uuid,
  claimed_connection_id uuid references zid_oauth_connections(id),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zid_marketplace_installs_status_check check (status in ('unclaimed', 'claimed', 'expired'))
);

create index if not exists idx_zid_marketplace_installs_status on zid_marketplace_installs(status);
