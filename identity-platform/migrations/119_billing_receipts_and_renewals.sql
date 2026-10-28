-- Phase 3 of Madar Admin billing: receipts, renewal reminders, and lapsing unpaid subscriptions.

-- A paid period that ran past its end plus the grace period is switched off by billing
-- maintenance (subscriptions/maintenance.ts) and stored as "expired" -- read-time status alone
-- can't express it, because the grace period is a setting that can change afterwards.
alter table organization_subscriptions
  drop constraint if exists organization_subscriptions_status_check;
alter table organization_subscriptions
  add constraint organization_subscriptions_status_check
    check (status in ('trial', 'active', 'cancelled', 'expired'));

-- One reminder per subscription per period end -- the unique index is what keeps two backend
-- tasks running maintenance at the same time from emailing a customer twice.
create table if not exists subscription_renewal_reminders (
  id uuid primary key,
  subscription_id uuid not null references organization_subscriptions(id),
  period_end timestamptz not null,
  sent_at timestamptz not null default now()
);
create unique index if not exists uq_subscription_renewal_reminders_period
  on subscription_renewal_reminders(subscription_id, period_end);

-- A receipt for every successful payment: a confirmed card payment, or an approved bank
-- transfer. Numbered sequentially (MDR-000001, ...) and snapshotted at issue time, so it never
-- changes when the customer, package, or price changes later. Created lazily from the payments
-- themselves (billing/receipts.ts) -- not backfilled here, for the same reasons as
-- organization_subscriptions (migrations replay on every boot; pg-mem has no gen_random_uuid()).
create table if not exists platform_receipts (
  id uuid primary key,
  sequence integer not null,
  number varchar(20) not null,
  organization_id uuid not null references organizations(id),
  source_type varchar(16) not null,
  source_id uuid not null,
  application varchar(32) not null,
  package_name text,
  billing_interval varchar(8),
  amount_halalas integer not null,
  original_amount_halalas integer,
  discount_halalas integer,
  coupon_code varchar(40),
  currency varchar(8) not null default 'SAR',
  payment_method varchar(40),
  payment_reference varchar(80),
  customer_snapshot jsonb not null default '{}'::jsonb,
  paid_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint platform_receipts_source_type_check
    check (source_type in ('card', 'bank_transfer'))
);
create unique index if not exists uq_platform_receipts_sequence on platform_receipts(sequence);
create unique index if not exists uq_platform_receipts_source on platform_receipts(source_type, source_id);
create index if not exists idx_platform_receipts_org on platform_receipts(organization_id);
