-- The timeline records quotes and invoices too: their activity kinds are allowed in
-- 140_sales_lead_call_requests.sql, which keeps the one current list (every migration re-runs on
-- each deploy, so an older list here would reject newer rows).

-- Quotes (عروض الأسعار) Madar's sales team sends a lead, and the invoices they become. Lines are
-- Madar app packages (priced from the pricing settings) or free-text lines; totals carry 15% VAT.
-- Paying an invoice -- online by card or a bank transfer staff confirm -- switches the quoted apps
-- on for the customer's Madar account.
create table if not exists crm_quotes (
  id uuid primary key,
  number varchar(32) not null,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  status varchar(16) not null default 'draft',
  -- [{ kind: "package" | "custom", application, packageId, packageName, interval, description,
  --    quantity, unitPriceHalalas }]
  items jsonb not null default '[]'::jsonb,
  discount_halalas integer not null default 0,
  subtotal_halalas integer not null,
  vat_halalas integer not null,
  total_halalas integer not null,
  valid_until date,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_quotes_status_check
    check (status in ('draft', 'sent', 'accepted', 'rejected', 'converted'))
);

create unique index if not exists idx_crm_quotes_number on crm_quotes(number);
create index if not exists idx_crm_quotes_lead on crm_quotes(lead_id);

create table if not exists crm_invoices (
  id uuid primary key,
  number varchar(32) not null,
  quote_id uuid references crm_quotes(id),
  lead_id uuid not null references crm_leads(id) on delete cascade,
  status varchar(16) not null default 'unpaid',
  items jsonb not null default '[]'::jsonb,
  discount_halalas integer not null default 0,
  subtotal_halalas integer not null,
  vat_halalas integer not null,
  total_halalas integer not null,
  due_date date,
  notes text,
  -- The secret in the link the customer pays from.
  pay_token varchar(64) not null,
  paid_at timestamptz,
  payment_method varchar(16),
  payment_reference text,
  -- When the quoted apps were switched on, and for which Madar account.
  activated_at timestamptz,
  activated_organization_id uuid references organizations(id),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_invoices_status_check check (status in ('unpaid', 'paid', 'void')),
  constraint crm_invoices_payment_method_check
    check (payment_method is null or payment_method in ('card', 'bank_transfer'))
);

create unique index if not exists idx_crm_invoices_number on crm_invoices(number);
create unique index if not exists idx_crm_invoices_pay_token on crm_invoices(pay_token);
create index if not exists idx_crm_invoices_lead on crm_invoices(lead_id);
