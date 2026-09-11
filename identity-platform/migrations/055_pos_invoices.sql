-- A completed (or cancelled/returned) point-of-sale sale -- what "الفواتير" lists, and what the
-- cashier screen's checkout will insert into once it exists.
--
-- Customer is a snapshot (name/phone typed at sale time), not a foreign key into the synced-
-- customer aggregation (customers/service.ts): that view is a live GROUP BY over synced
-- storefront orders with no stable row of its own to reference, and most physical branches have
-- no connected storefront at all, so "walk-in, no customer" (customer_name null) has to be the
-- default this table supports, not an edge case.
--
-- Line items are also snapshots (product_name/unit_price captured at sale time) rather than a
-- live join to products -- an invoice must keep reading the price it was actually sold at even
-- after the product's price changes or the product itself is later deleted. product_id has no
-- foreign key: it can point at a native Madar product (a real uuid in products) or a synced
-- storefront product (an external entity id with no row here at all), and either way the
-- snapshot columns are the ones the invoice actually reads.
create table if not exists pos_invoices (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid not null references workspaces(id),
  invoice_number text not null unique,
  status text not null default 'completed' check (status in ('completed', 'cancelled', 'returned')),
  customer_name text,
  customer_phone text,
  cashier_user_id uuid references users(id),
  payment_method_code text not null,
  subtotal_amount numeric(12, 2) not null,
  discount_amount numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null,
  total_amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_invoices_org on pos_invoices(organization_id);
create index if not exists idx_pos_invoices_workspace on pos_invoices(workspace_id);
create index if not exists idx_pos_invoices_created_at on pos_invoices(created_at);

create table if not exists pos_invoice_items (
  id uuid primary key,
  invoice_id uuid not null references pos_invoices(id) on delete cascade,
  product_id text,
  product_name text not null,
  unit_price numeric(12, 2) not null,
  quantity numeric(12, 3) not null,
  line_total numeric(12, 2) not null
);

create index if not exists idx_pos_invoice_items_invoice on pos_invoice_items(invoice_id);

-- Sequential, human-facing numbers ("INV-000001") instead of exposing the uuid. A single global
-- sequence rather than one restarting from 1 per organization is a deliberate simplification for
-- this platform's current scale -- revisit if per-organization numbering is ever required.
create sequence if not exists pos_invoice_number_seq;
