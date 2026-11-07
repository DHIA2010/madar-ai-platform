-- The Promotions app (its own subscription, promotionsEnabled): automatic discounts the cashier
-- applies by itself -- a percentage or a fixed amount off each unit, on every product, chosen
-- products or whole categories, limited by branch, dates, weekdays and hours. See
-- promotions/service.ts and promotions/engine.ts.
--
-- Lists are jsonb arrays (an empty array means "no limit": every branch, every day).
-- Times are "HH:MM" in the store's local time; an end before the start runs past midnight.
create table if not exists promotions (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  discount_type text not null,
  discount_value numeric(14,4) not null,
  -- Caps a percentage discount per unit (in the product's shown price, as the customer sees it).
  max_discount_per_unit numeric(14,4),
  scope text not null default 'all',
  product_ids jsonb not null default '[]'::jsonb,
  categories jsonb not null default '[]'::jsonb,
  excluded_product_ids jsonb not null default '[]'::jsonb,
  workspace_ids jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  -- 0 = Sunday ... 6 = Saturday.
  days_of_week jsonb not null default '[]'::jsonb,
  start_time text,
  end_time text,
  -- The Ministry of Commerce discount licence (تصريح التخفيضات), when the store has one.
  licence_number text,
  is_paused boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint promotions_discount_type_check check (discount_type in ('percent', 'fixed')),
  constraint promotions_discount_value_check check (discount_value > 0),
  constraint promotions_scope_check check (scope in ('all', 'products', 'categories'))
);

create index if not exists idx_promotions_organization on promotions(organization_id);

-- Which promotion discounted a sale line, and by how much (net, before VAT). discount_amount stays
-- the line's whole discount (promotion + the cashier's own), so receipts, ZATCA and returns read
-- it unchanged.
alter table pos_invoice_items add column if not exists promotion_id uuid references promotions(id);
alter table pos_invoice_items add column if not exists promotion_name text;
alter table pos_invoice_items
  add column if not exists promotion_discount_amount numeric(14,4) not null default 0;
create index if not exists idx_pos_invoice_items_promotion on pos_invoice_items(promotion_id);
