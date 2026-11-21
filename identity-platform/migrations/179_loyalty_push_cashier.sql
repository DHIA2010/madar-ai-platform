-- Loyalty: notifications on a card saved to the phone's home screen (web push), and rewards
-- used on a cashier sale.

-- The one key pair Madar signs its web push messages with. Made on first use; the private half
-- is stored encrypted.
create table if not exists loyalty_push_keys (
  id smallint primary key,
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);

-- A phone or browser that asked for a card's notifications.
create table if not exists loyalty_push_subscriptions (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_loyalty_push_endpoint
  on loyalty_push_subscriptions(endpoint);
create index if not exists idx_loyalty_push_member on loyalty_push_subscriptions(member_id);
create index if not exists idx_loyalty_push_org on loyalty_push_subscriptions(organization_id);

-- The cashier sale a reward was used on (the sale's own attempt key), so the same sale sent
-- twice uses the reward once.
alter table loyalty_redemptions add column if not exists sale_key text;
create index if not exists idx_loyalty_redemptions_sale
  on loyalty_redemptions(organization_id, sale_key);
