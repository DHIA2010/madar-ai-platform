-- Ephemeral record of "this org/user just clicked Connect for Salla and is mid-flow on Salla's
-- own App Store install page." Salla's install URL (s.salla.sa/apps/install/{app-id}) has no
-- query-param passthrough, so there is no way to thread an org/workspace reference through to the
-- app.store.authorize webhook -- this table is the only signal MADAR has, scoped to the actor who
-- initiated it, to safely surface a just-created salla_marketplace_installs row back to the right
-- org without ever exposing a cross-tenant list of pending installs.

create table if not exists salla_connect_intents (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  user_id uuid not null references users(id),
  resolved_install_id uuid references salla_marketplace_installs(id),
  -- Plaintext, unlike salla_marketplace_installs.claim_token_hash -- acceptable here because this
  -- row is already scoped to one org/user and short-lived (10-min expires_at), so caching it lets
  -- repeated polls reuse the same claim token without re-issuing (rotating) it on every request.
  -- Issued fresh (via issueClaimTokenForInstall) the first time a unique candidate is found,
  -- rather than ever reading the install row's original token, which is never persisted in
  -- plaintext anywhere past the webhook handler's local scope.
  resolved_claim_token text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_salla_connect_intents_expires_at on salla_connect_intents(expires_at);
create index if not exists idx_salla_connect_intents_org on salla_connect_intents(organization_id);
