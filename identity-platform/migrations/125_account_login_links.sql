-- One-click sign-in links e-mailed to a merchant whose Madar account was set up for them (a Salla
-- App Store install): opening one signs that account in -- replacing whoever was signed in on the
-- browser -- straight into the store's organization. Reusable until it expires.
create table if not exists account_login_links (
  id uuid primary key,
  token_hash varchar(64) not null unique,
  user_id uuid not null,
  organization_id uuid not null,
  redirect_path text not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
