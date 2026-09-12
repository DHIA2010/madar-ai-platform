-- Native (Madar-owned) customers.
--
-- Until now "customers" meant one thing only: the read-only aggregation in customers/service.ts
-- over synced salla_records/shopify_records/zid_records orders. A branch with no connected
-- storefront -- most physical POS branches -- therefore had zero customers to show and no way to
-- record a walk-in's details for reuse, since there was no table a customer could be written to.
--
-- Mirrors 047_native_products.sql's reasoning: authored here rather than synced, so these rows
-- carry their own lifecycle and are never touched by a connector sync. Kept deliberately small --
-- no order history of its own (a native customer's invoices stay a name/phone snapshot on
-- pos_invoices, same as any walk-in), so there is nothing here to compute totalOrders/lifetime
-- value from; those read as zero/blank for a native customer until a real linking feature exists.
create table if not exists customers (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  name text not null,
  email text,
  phone text,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_customers_org on customers(organization_id) where deleted_at is null;
create index if not exists idx_customers_org_workspace
  on customers(organization_id, workspace_id) where deleted_at is null;
