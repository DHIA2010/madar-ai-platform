-- Discount coupons for Madar subscriptions, managed from Madar Admin and redeemed at Moyasar card
-- checkout. A coupon can be limited to one or several applications (empty = every application,
-- including the Madar Complete bundle), to specific packages of those applications (empty = any of
-- their packages), and to monthly and/or yearly billing.
create table if not exists platform_coupons (
  id uuid primary key,
  code varchar(40) not null,
  discount_type varchar(16) not null,
  -- Whole percent (1-100) for "percentage"; halalas for "fixed".
  discount_value integer not null,
  applications jsonb not null default '[]'::jsonb,
  package_ids jsonb not null default '[]'::jsonb,
  billing_intervals jsonb not null default '["monthly","yearly"]'::jsonb,
  -- Null = unlimited.
  usage_limit integer,
  -- Null = never expires (valid through the end of that day otherwise).
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_coupons_discount_type_check
    check (discount_type in ('percentage', 'fixed')),
  constraint platform_coupons_discount_value_check check (discount_value > 0),
  constraint platform_coupons_usage_limit_check check (usage_limit is null or usage_limit > 0)
);
create unique index if not exists uq_platform_coupons_code on platform_coupons(code);

-- One row per successful payment that used a coupon -- the usage count is derived from these, so
-- an abandoned or failed checkout never consumes a use.
create table if not exists platform_coupon_redemptions (
  id uuid primary key,
  coupon_id uuid not null references platform_coupons(id),
  organization_id uuid not null references organizations(id),
  payment_id uuid not null,
  discount_halalas integer not null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_platform_coupon_redemptions_payment
  on platform_coupon_redemptions(payment_id);
create index if not exists idx_platform_coupon_redemptions_coupon
  on platform_coupon_redemptions(coupon_id);

-- What the checkout was before the coupon, and which coupon reduced it.
alter table billing_moyasar_payments add column if not exists coupon_id uuid;
alter table billing_moyasar_payments add column if not exists original_amount integer;
alter table billing_moyasar_payments add column if not exists discount_halalas integer;
