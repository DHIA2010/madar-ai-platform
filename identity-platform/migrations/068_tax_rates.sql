-- Configurable tax rates, replacing the single hardcoded 15% VAT_RATE constant that
-- invoices-service.ts (and its frontend mirrors in CashierPage/InvoicesPage/customer-statement)
-- used everywhere. Each organization can now name its own set of rates (a standard sales-tax
-- rate, an exempt/zero-rate classification, or a custom one) and mark exactly one as the default
-- actually charged on a sale. TaxRatesService lazily creates a real 15% "ضريبة القيمة المضافة"
-- default row for an organization the first time it's asked for one that has none yet, rather
-- than backfilling here -- pg-mem (this codebase's test harness) has no gen_random_uuid(), and
-- every other table in this codebase already generates its ids in application code, not SQL.
create table if not exists tax_rates (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  type text not null check (type in ('sales_tax', 'exempt', 'zero_rate', 'custom')),
  rate_percent numeric(6, 3) not null check (rate_percent >= 0 and rate_percent <= 100),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tax_rates_org on tax_rates(organization_id);

-- Enforced at the database level, not just in application code, so a race between two concurrent
-- "make this the default" requests can never leave two rows both marked default for the same
-- organization.
create unique index if not exists uq_tax_rates_one_default_per_org
  on tax_rates(organization_id) where is_default;
