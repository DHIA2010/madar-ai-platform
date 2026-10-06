-- First real money-moving integration in Madar: Moyasar charges a merchant for their own Madar
-- subscription (replaces the manual bank-transfer-receipt + admin-approval path in
-- subscription_activation_requests for the self-serve tiers -- starter/growth/pro). A row is
-- created when checkout starts (moyasar_payment_id still unknown at that point -- Moyasar only
-- assigns one once the hosted widget actually submits the card), then updated to 'paid'/'failed'
-- once Moyasar confirms it, via either the synchronous confirm route or the webhook, whichever
-- lands first -- both paths are idempotent on status.
create table if not exists billing_moyasar_payments (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  requested_by_user_id uuid not null references users(id),
  application varchar(32) not null,
  plan_tier varchar(32) not null,
  amount integer not null,
  currency varchar(8) not null default 'SAR',
  moyasar_payment_id varchar(64),
  status varchar(32) not null default 'initiated',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_moyasar_payments_status_check
    check (status in ('initiated', 'paid', 'failed')),
  constraint billing_moyasar_payments_application_check
    check (application in ('advertising', 'ecommerce', 'pos', 'madarApps')),
  constraint billing_moyasar_payments_plan_tier_check
    check (plan_tier in ('starter', 'growth', 'pro'))
);

create index if not exists idx_billing_moyasar_payments_org
  on billing_moyasar_payments(organization_id);

-- Null while 'initiated' (Moyasar hasn't assigned an id yet), so only enforced once set.
create unique index if not exists uq_billing_moyasar_payments_moyasar_id
  on billing_moyasar_payments(moyasar_payment_id)
  where moyasar_payment_id is not null;
