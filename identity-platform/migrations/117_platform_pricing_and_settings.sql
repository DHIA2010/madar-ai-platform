-- Per-application pricing managed from Madar Admin, replacing the account-wide starter/growth/pro
-- prices that were hardcoded in code (plan-pricing.ts / plan-tiers.ts).
--
-- Each application (and the "madarComplete" bundle) has a pricing mode:
--   packages -- the customer picks one of its packages
--   fixed    -- one price, no choice (its single package carries the price)
--   contact  -- no online price; the customer contacts Madar
-- and any number of packages, each with a monthly and/or yearly price. Default rows are created
-- lazily from code the first time pricing is read (pricing/seed.ts) -- every migration replays on
-- every boot, and pg-mem (the test harness) has no gen_random_uuid().
create table if not exists platform_app_pricing (
  application varchar(32) primary key,
  pricing_mode varchar(16) not null,
  updated_at timestamptz not null default now(),
  constraint platform_app_pricing_mode_check
    check (pricing_mode in ('packages', 'fixed', 'contact'))
);

create table if not exists platform_packages (
  id uuid primary key,
  application varchar(32) not null,
  name text not null,
  description text not null default '',
  features jsonb not null default '[]'::jsonb,
  monthly_price_halalas integer,
  yearly_price_halalas integer,
  is_recommended boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  -- The account-wide tier this package corresponds to, for the seeded Starter/Growth/Pro rows --
  -- keeps organizations.settings.currentPlanTier meaningful for features that still read it.
  legacy_plan_tier varchar(16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_packages_monthly_price_check
    check (monthly_price_halalas is null or monthly_price_halalas >= 0),
  constraint platform_packages_yearly_price_check
    check (yearly_price_halalas is null or yearly_price_halalas >= 0)
);
create index if not exists idx_platform_packages_application
  on platform_packages(application, sort_order);

-- One row (id = 1): platform-wide settings edited from Madar Admin (trial length, sign-up and
-- maintenance switches, announcement banner, renewal policy). Missing keys fall back to code
-- defaults (platform-settings/defaults.ts).
create table if not exists platform_settings (
  id smallint primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid,
  constraint platform_settings_singleton_check check (id = 1)
);

-- What was bought: the package and billing period, alongside the legacy tier (now optional).
alter table organization_subscriptions add column if not exists package_id uuid;
alter table organization_subscriptions add column if not exists package_name text;

-- A bank-transfer request snapshots the package's name and price when it's submitted, so the
-- approval grants exactly what the customer saw and paid for, even if pricing changes meanwhile.
alter table subscription_activation_requests add column if not exists package_id uuid;
alter table subscription_activation_requests add column if not exists package_name text;
alter table subscription_activation_requests add column if not exists billing_interval varchar(8);
alter table subscription_activation_requests add column if not exists price_halalas integer;
alter table subscription_activation_requests alter column plan_tier drop not null;

alter table billing_moyasar_payments add column if not exists package_id uuid;
alter table billing_moyasar_payments add column if not exists billing_interval varchar(8);
alter table billing_moyasar_payments alter column plan_tier drop not null;

-- plan_tier is optional now (a package created in Madar Admin has no tier). Postgres already lets
-- NULL through an `in (...)` check, but the constraints are restated with an explicit
-- `is null or` so the intent is unambiguous (and pg-mem, the test harness, agrees).
alter table subscription_activation_requests
  drop constraint if exists subscription_activation_requests_plan_tier_check;
alter table subscription_activation_requests
  add constraint subscription_activation_requests_plan_tier_check
    check (plan_tier is null or plan_tier in ('starter', 'growth', 'pro', 'enterprise'));

alter table billing_moyasar_payments
  drop constraint if exists billing_moyasar_payments_plan_tier_check;
alter table billing_moyasar_payments
  add constraint billing_moyasar_payments_plan_tier_check
    check (plan_tier is null or plan_tier in ('starter', 'growth', 'pro'));

-- The bundle is purchasable now, through both checkout and bank-transfer requests.
alter table subscription_activation_requests
  drop constraint if exists subscription_activation_requests_application_check;
alter table subscription_activation_requests
  add constraint subscription_activation_requests_application_check
    check (application in (
      'advertising', 'ecommerce', 'pos', 'madarApps', 'procurement', 'expenses', 'ai',
      'customReports', 'madarComplete'
    ));

alter table billing_moyasar_payments
  drop constraint if exists billing_moyasar_payments_application_check;
alter table billing_moyasar_payments
  add constraint billing_moyasar_payments_application_check
    check (application in (
      'advertising', 'ecommerce', 'pos', 'madarApps', 'procurement', 'expenses', 'ai',
      'customReports', 'madarComplete'
    ));
