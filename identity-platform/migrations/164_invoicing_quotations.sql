-- The Invoicing & Quotations app (its own subscription, invoicingEnabled): quotations a merchant
-- sends to businesses, converted in full, by line or by percentage (progress claims) into tax
-- invoices that ZATCA clears (standard, B2B) or that are reported (simplified, B2C), plus advance
-- payment invoices, retention, credit/debit notes and payments.

-- One counter per organization and document kind (quotation, invoice, credit_note, debit_note),
-- upserted in the same transaction as the number it hands out so a rolled-back issue never burns one.
create table if not exists sales_document_counters (
  organization_id uuid not null references organizations(id),
  kind varchar(24) not null,
  last_value bigint not null default 0,
  primary key (organization_id, kind)
);

create table if not exists sales_quotations (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  number varchar(32) not null,
  -- A revision keeps its quotation's number; revision_of points at the one it replaced.
  revision integer not null default 1,
  revision_of uuid references sales_quotations(id) on delete set null,
  status varchar(16) not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'superseded')),
  sector varchar(16) not null default 'general'
    check (sector in ('general', 'services', 'contracting')),
  customer_id uuid references customers(id) on delete set null,
  -- The buyer as it was on the quotation: name, VAT, CRN, national address, contact.
  customer jsonb not null default '{}',
  title text,
  reference text,
  issue_date date not null,
  valid_until date,
  currency varchar(8) not null default 'SAR',
  discount_type varchar(8) not null default 'amount' check (discount_type in ('amount', 'percent')),
  discount_value numeric(14, 2) not null default 0,
  subtotal numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  taxable_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  -- Contracting: the share of the contract paid in advance and held back from each claim.
  advance_percent numeric(6, 3) not null default 0,
  retention_percent numeric(6, 3) not null default 0,
  payment_terms text,
  terms text,
  notes text,
  public_token varchar(64) not null,
  sent_at timestamptz,
  responded_at timestamptz,
  responded_by text,
  decline_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sales_quotations_org on sales_quotations(organization_id) where deleted_at is null;
create unique index if not exists idx_sales_quotations_token on sales_quotations(public_token);

create table if not exists sales_quotation_lines (
  id uuid primary key,
  quotation_id uuid not null references sales_quotations(id) on delete cascade,
  position integer not null,
  line_type varchar(12) not null default 'item' check (line_type in ('item', 'section', 'note')),
  product_id uuid,
  description text not null default '',
  details text,
  unit varchar(24),
  quantity numeric(16, 4) not null default 0,
  unit_price numeric(16, 4) not null default 0,
  discount_percent numeric(6, 3) not null default 0,
  -- ZATCA VAT category: S standard, Z zero-rated, E exempt, O out of scope (with its VATEX code).
  tax_category varchar(2) not null default 'S' check (tax_category in ('S', 'Z', 'E', 'O')),
  tax_rate numeric(6, 3) not null default 15,
  exemption_code varchar(32),
  exemption_reason text,
  net_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0
);
create index if not exists idx_sales_quotation_lines_quotation on sales_quotation_lines(quotation_id);

create table if not exists sales_invoices (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  -- Given when the document is issued (drafts have none).
  number varchar(32),
  document_type varchar(12) not null default 'invoice'
    check (document_type in ('invoice', 'credit_note', 'debit_note')),
  -- standard: ZATCA clearance (B2B); simplified: ZATCA reporting (B2C).
  tax_type varchar(12) not null default 'standard' check (tax_type in ('standard', 'simplified')),
  -- regular invoice, advance payment invoice (ZATCA 386) or a contracting progress claim.
  invoice_kind varchar(12) not null default 'regular'
    check (invoice_kind in ('regular', 'advance', 'progress')),
  status varchar(20) not null default 'draft'
    check (status in ('draft', 'pending_clearance', 'issued', 'void')),
  sector varchar(16) not null default 'general'
    check (sector in ('general', 'services', 'contracting')),
  quotation_id uuid references sales_quotations(id) on delete set null,
  -- Credit/debit notes: the invoice they correct and why (ZATCA KSA-10).
  original_invoice_id uuid references sales_invoices(id) on delete set null,
  adjustment_reason_code varchar(32),
  adjustment_reason text,
  claim_number integer,
  customer_id uuid references customers(id) on delete set null,
  customer jsonb not null default '{}',
  seller jsonb not null default '{}',
  title text,
  reference text,
  issue_date date not null,
  supply_date date,
  supply_end_date date,
  due_date date,
  payment_terms text,
  -- UN/ECE 4461: 10 cash, 30 credit transfer, 42 bank account, 48 card, 1 not defined.
  payment_means varchar(4) not null default '30',
  currency varchar(8) not null default 'SAR',
  discount_type varchar(8) not null default 'amount' check (discount_type in ('amount', 'percent')),
  discount_value numeric(14, 2) not null default 0,
  subtotal numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  taxable_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  -- Advance payments deducted from this invoice (VAT inclusive) and retention held back.
  prepaid_amount numeric(14, 2) not null default 0,
  retention_percent numeric(6, 3) not null default 0,
  retention_amount numeric(14, 2) not null default 0,
  amount_due numeric(14, 2) not null default 0,
  terms text,
  notes text,
  public_token varchar(64) not null,
  issued_at timestamptz,
  zatca_device_id uuid references zatca_devices(id),
  icv bigint,
  previous_invoice_hash text,
  invoice_hash text,
  zatca_uuid uuid,
  zatca_signed_xml text,
  -- What ZATCA returned for a cleared (standard) invoice -- the legal copy, stamped and with its QR.
  zatca_cleared_xml text,
  qr_code text,
  -- null (not sent: no device), pending, cleared, reported, rejected.
  zatca_status varchar(16),
  zatca_response jsonb,
  zatca_warnings jsonb,
  zatca_submitted_at timestamptz,
  zatca_attempts integer not null default 0,
  zatca_last_attempt_at timestamptz,
  zatca_last_error text,
  zatca_last_error_ar text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sales_invoices_org on sales_invoices(organization_id) where deleted_at is null;
create unique index if not exists idx_sales_invoices_number
  on sales_invoices(organization_id, number) where number is not null;
create unique index if not exists idx_sales_invoices_token on sales_invoices(public_token);
create index if not exists idx_sales_invoices_quotation on sales_invoices(quotation_id);
create index if not exists idx_sales_invoices_original on sales_invoices(original_invoice_id);

create table if not exists sales_invoice_lines (
  id uuid primary key,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  position integer not null,
  line_type varchar(12) not null default 'item' check (line_type in ('item', 'section', 'note')),
  quotation_line_id uuid references sales_quotation_lines(id) on delete set null,
  product_id uuid,
  description text not null default '',
  details text,
  unit varchar(24),
  quantity numeric(16, 4) not null default 0,
  unit_price numeric(16, 4) not null default 0,
  discount_percent numeric(6, 3) not null default 0,
  tax_category varchar(2) not null default 'S' check (tax_category in ('S', 'Z', 'E', 'O')),
  tax_rate numeric(6, 3) not null default 15,
  exemption_code varchar(32),
  exemption_reason text,
  net_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  -- Progress claims: the line's completion before and after this claim (percent of the contract).
  progress_previous numeric(7, 3),
  progress_current numeric(7, 3)
);
create index if not exists idx_sales_invoice_lines_invoice on sales_invoice_lines(invoice_id);
create index if not exists idx_sales_invoice_lines_quotation_line on sales_invoice_lines(quotation_line_id);

-- An advance payment invoice deducted from a later invoice (its net and VAT parts).
create table if not exists sales_invoice_prepayments (
  id uuid primary key,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  advance_invoice_id uuid not null references sales_invoices(id),
  net_amount numeric(14, 2) not null,
  tax_amount numeric(14, 2) not null,
  tax_rate numeric(6, 3) not null default 15
);
create index if not exists idx_sales_invoice_prepayments_invoice on sales_invoice_prepayments(invoice_id);
create index if not exists idx_sales_invoice_prepayments_advance on sales_invoice_prepayments(advance_invoice_id);

create table if not exists sales_invoice_payments (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  amount numeric(14, 2) not null,
  paid_on date not null,
  method varchar(16) not null default 'bank_transfer'
    check (method in ('cash', 'bank_transfer', 'card', 'cheque', 'other')),
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_sales_invoice_payments_invoice on sales_invoice_payments(invoice_id);
