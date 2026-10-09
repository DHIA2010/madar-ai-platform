-- Real backend for Suppliers / Purchases / Purchase Returns / Supplier Vouchers -- replaces the
-- entirely frontend-only (Zustand-mock) version of this whole area. Purchase/return creation also
-- writes directly to products.stock_quantity/cost_price (see procurement/ service code), the same
-- kind of safe, partial, non-full-replace write pos/invoices-service.ts already does for sales.

-- One shared, org-scoped counter table for every human-readable code this module issues
-- ("#SUP-0001", "#PUR-0001", "#RET-0001", "RV-0001", "PV-0001"). Org-scoped rather than
-- workspace-scoped (unlike pos_invoice_number_counters) because none of these four resources have
-- any workspace concept in their current data model or code-generation logic -- today's frontend
-- scans the whole list globally. Upserted inside the same transaction as the row it numbers, so a
-- rolled-back create never burns a number (same reasoning as pos_invoice_number_counters, see
-- migration 067).
create table if not exists procurement_code_counters (
  organization_id uuid not null references organizations(id),
  code_type varchar(32) not null,
  next_number bigint not null default 0,
  primary key (organization_id, code_type)
);

create table if not exists suppliers (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  code varchar(32) not null,
  name text not null,
  email text,
  phone text,
  kind varchar(16) not null check (kind in ('local', 'international')),
  country text,
  city text,
  payment_terms varchar(16) check (payment_terms is null or payment_terms in ('prepaid', 'cod', 'net15', 'net30', 'net45', 'net60')),
  address text,
  status varchar(16) not null default 'active' check (status in ('active', 'inactive')),
  image_url text,
  -- Whole SupplierBankDetails/SupplierCompanyDetails objects, each ~10 sub-fields, never
  -- individually queried/filtered by -- JSONB avoids ~20 columns of migration churn for data
  -- that's always read/written as one nested object by the frontend form.
  bank_details jsonb not null default '{}',
  company_details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists idx_suppliers_org_code on suppliers(organization_id, code);
create index if not exists idx_suppliers_org on suppliers(organization_id) where deleted_at is null;

create table if not exists purchases (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  code varchar(32) not null,
  supplier_id uuid not null references suppliers(id),
  -- Warehouses are a small, static, hardcoded constant list on the frontend (WAREHOUSES) -- no
  -- warehouses table exists or is planned, so this stays a plain id, not a foreign key.
  warehouse_id varchar(64) not null,
  date date not null,
  due_date date,
  delivery_date date,
  status varchar(16) not null default 'pending' check (status in ('received', 'pending')),
  order_tax_percent numeric(6, 3) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  shipping_amount numeric(14, 2) not null default 0,
  other_costs numeric(14, 2) not null default 0,
  currency varchar(8) not null default 'SAR',
  payment_method varchar(16) check (payment_method is null or payment_method in ('cash', 'bank_transfer', 'card', 'cheque')),
  reference_number text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_purchases_org on purchases(organization_id) where deleted_at is null;
create index if not exists idx_purchases_supplier on purchases(supplier_id);

create table if not exists purchase_line_items (
  id uuid primary key,
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid not null references products(id),
  -- Snapshots at time of purchase -- independent of the live product row, same convention as
  -- pos_invoice_items.product_name.
  product_name text not null,
  sku text not null,
  net_unit_cost numeric(14, 4) not null,
  qty numeric(14, 4) not null,
  discount numeric(14, 2) not null default 0,
  tax_percent numeric(6, 3) not null default 0,
  position int not null default 0
);
create index if not exists idx_purchase_line_items_purchase on purchase_line_items(purchase_id);

create table if not exists purchase_returns (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  code varchar(32) not null,
  purchase_id uuid not null references purchases(id),
  supplier_id uuid not null references suppliers(id),
  warehouse_id varchar(64) not null,
  status varchar(16) not null default 'pending' check (status in ('pending', 'approved', 'refunded', 'rejected')),
  return_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_purchase_returns_org on purchase_returns(organization_id) where deleted_at is null;
create index if not exists idx_purchase_returns_purchase on purchase_returns(purchase_id);
create index if not exists idx_purchase_returns_supplier on purchase_returns(supplier_id);

create table if not exists purchase_return_items (
  id uuid primary key,
  return_id uuid not null references purchase_returns(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  sku text not null,
  qty numeric(14, 4) not null,
  unit_cost numeric(14, 4) not null,
  position int not null default 0
);
create index if not exists idx_purchase_return_items_return on purchase_return_items(return_id);

-- سند قبض (receipt) / سند صرف (payment) -- a manually-recorded money movement against a supplier's
-- account, optionally linked to the specific purchase invoice it settles/refunds. purchase_id is
-- nullable: a voucher can also record a general account top-up/payment not tied to one invoice.
create table if not exists supplier_vouchers (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  reference varchar(32) not null,
  supplier_id uuid not null references suppliers(id),
  purchase_id uuid references purchases(id),
  type varchar(16) not null check (type in ('receipt', 'payment')),
  amount numeric(14, 2) not null,
  tax_inclusive boolean not null default false,
  tax_amount numeric(14, 2) not null default 0,
  payment_method varchar(16) not null check (payment_method in ('cash', 'card', 'transfer')),
  notes text,
  transaction_date date not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_supplier_vouchers_org on supplier_vouchers(organization_id) where deleted_at is null;
create index if not exists idx_supplier_vouchers_supplier on supplier_vouchers(supplier_id);
create index if not exists idx_supplier_vouchers_purchase on supplier_vouchers(purchase_id);
