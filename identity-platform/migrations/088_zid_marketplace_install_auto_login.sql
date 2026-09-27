-- Auto-provisioning handoff: when a Zid marketplace install's manager-profile email doesn't
-- match any existing MADAR user, the merchant's account/org/workspace/membership are created
-- immediately and this row is claimed right away (see zid-oauth's auto-provision service) rather
-- than waiting on a manual login/register step. The real session is only ever minted at the
-- moment the handoff token below is consumed -- these columns hold nothing but an opaque,
-- single-use, short-lived proof that a given browser is the one that just completed the install,
-- so no live session credential sits in the database (or in a URL) ahead of that.

alter table zid_marketplace_installs
  add column if not exists auto_login_token_hash text,
  add column if not exists auto_login_expires_at timestamptz,
  add column if not exists auto_provisioned_user_id uuid references users(id);

create unique index if not exists idx_zid_marketplace_installs_auto_login_token_hash
  on zid_marketplace_installs(auto_login_token_hash)
  where auto_login_token_hash is not null;
