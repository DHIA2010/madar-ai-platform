-- The Loyalty app: one points programme per business, used by every app that sells something
-- (bookings, the cashier). Customers earn points on what they pay, plus bonuses the business
-- switches on, and trade them for rewards. Each member has a card with a code, opened from a
-- link, and optionally kept in Apple Wallet.

-- The programme itself. join_code is the short code in the join link and QR.
create table if not exists loyalty_programs (
  organization_id uuid primary key references organizations(id) on delete cascade,
  is_active boolean not null default false,
  join_code varchar(16) not null,
  display_name text,
  points_per_sar numeric(10, 2) not null default 1,
  point_value numeric(10, 4) not null default 0.05,
  review_bonus_enabled boolean not null default false,
  review_bonus_points integer not null default 50,
  google_review_url text,
  online_bonus_enabled boolean not null default false,
  online_bonus_points integer not null default 20,
  card_color varchar(7) not null default '#0b1738',
  text_color varchar(7) not null default '#ffffff',
  card_title text,
  card_note text,
  terms text,
  wallet_notify_points boolean not null default true,
  nearby_enabled boolean not null default false,
  nearby_message text,
  locations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_loyalty_programs_join_code on loyalty_programs(join_code);

-- What points can be traded for. kind: amount (riyals off), percent (percent off) or free
-- (one of the listed products or services for nothing). items names what the reward covers.
create table if not exists loyalty_rewards (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  points_cost integer not null,
  kind varchar(10) not null default 'amount',
  value numeric(12, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_loyalty_rewards_org on loyalty_rewards(organization_id);

-- A member: a customer of the business with a card. points is the balance, kept in step with
-- the ledger. token opens the card page. card_code is what the staff scan or type.
create table if not exists loyalty_members (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid,
  name text not null,
  phone text,
  card_code varchar(16) not null,
  token varchar(64) not null,
  points integer not null default 0,
  lifetime_points integer not null default 0,
  source varchar(12) not null default 'staff',
  review_bonus_at timestamptz,
  wallet_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_loyalty_members_token on loyalty_members(token);
create index if not exists idx_loyalty_members_org on loyalty_members(organization_id);
create index if not exists idx_loyalty_members_customer
  on loyalty_members(organization_id, customer_id);

-- Every change to a balance, one line each. source is the app it came from and ref the sale
-- or booking behind it, so the same sale never earns twice.
create table if not exists loyalty_ledger (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  points integer not null,
  kind varchar(16) not null,
  source varchar(12) not null,
  ref text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_loyalty_ledger_member on loyalty_ledger(member_id);
create index if not exists idx_loyalty_ledger_ref on loyalty_ledger(organization_id, source, ref);

-- A reward a member took for points. active until the staff hand it over (used) or it is
-- cancelled and the points go back.
create table if not exists loyalty_redemptions (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  reward_id uuid,
  reward_name text not null,
  points_cost integer not null,
  kind varchar(10) not null,
  value numeric(12, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  code varchar(12) not null,
  status varchar(10) not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists idx_loyalty_redemptions_member on loyalty_redemptions(member_id);
create index if not exists idx_loyalty_redemptions_org
  on loyalty_redemptions(organization_id, status);

-- The phones holding a member card in Apple Wallet, so a changed balance can be pushed to them.
create table if not exists loyalty_wallet_devices (
  id uuid primary key,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  device_id text not null,
  push_token text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_loyalty_wallet_devices_member on loyalty_wallet_devices(member_id);
create index if not exists idx_loyalty_wallet_devices_device on loyalty_wallet_devices(device_id);
