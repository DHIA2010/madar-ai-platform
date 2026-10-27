-- One row per organization per Madar application: the real subscription behind the
-- organizations.settings `{app}Enabled` / `{app}TrialEndsAt` flags every access check reads. Those
-- flags stay the enforcement source; this table adds what they can't express -- when it started,
-- when the current period ends, what was paid, and how it was obtained -- for the Madar Admin
-- console (customers, subscriptions, revenue).
--
-- Written alongside the flags by every activation path: a free trial, an approved bank-transfer
-- request, a confirmed Moyasar payment, and Madar Admin's own grant/renew/cancel actions.
-- Organizations activated before this table existed get their row lazily, from their current
-- settings (see subscriptions/reconcile.ts) -- not backfilled here: every migration replays on
-- every boot, and pg-mem (the test harness) has no gen_random_uuid().
--
-- `application` is deliberately unconstrained here (validated in code): per-app packages and the
-- Madar Complete bundle are about to add values, and every other application CHECK in this schema
-- has needed a widening migration each time one was added.
create table if not exists organization_subscriptions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  application varchar(32) not null,
  status varchar(16) not null,
  plan_tier varchar(16),
  billing_interval varchar(8),
  price_halalas integer,
  currency varchar(8) not null default 'SAR',
  source varchar(24) not null,
  started_at timestamptz not null,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_subscriptions_status_check
    check (status in ('trial', 'active', 'cancelled')),
  constraint organization_subscriptions_interval_check
    check (billing_interval is null or billing_interval in ('monthly', 'yearly')),
  constraint organization_subscriptions_source_check
    check (source in ('trial', 'payment', 'bank_transfer', 'admin', 'existing'))
);

create unique index if not exists uq_organization_subscriptions_org_app
  on organization_subscriptions(organization_id, application);
create index if not exists idx_organization_subscriptions_period_end
  on organization_subscriptions(current_period_end);
