-- A cart parked mid-build ("معلقة") so the cashier can serve someone else and come back to it --
-- kept as a real row rather than only in the browser tab, since a crash or refresh must not
-- silently lose a customer's in-progress order. Items are a snapshot (same reasoning as
-- pos_invoice_items): a held cart must read back exactly the prices it was built with, even if a
-- product's price changes while it's sitting parked.
create table if not exists pos_held_orders (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid not null references workspaces(id),
  cashier_user_id uuid references users(id),
  customer_name text,
  customer_phone text,
  discount_amount numeric(12, 2) not null default 0,
  notes text,
  items jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_held_orders_org on pos_held_orders(organization_id);
create index if not exists idx_pos_held_orders_workspace_cashier
  on pos_held_orders(workspace_id, cashier_user_id);
