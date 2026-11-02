-- Stock per branch. products.stock_quantity (and product_variants.stock) stay the total across
-- all branches, so everything that reads a product's stock -- the products list, the online store
-- sync -- is unchanged; these rows split that total by branch. A total changed without naming a
-- branch (the product form, a store import) is settled into the product's own branch the next
-- time its stock is read or moved (see inventory/branch-stock.ts), so the rows never drift from it.
create table if not exists branch_stock (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid not null references workspaces(id),
  product_id uuid not null references products(id) on delete cascade,
  -- '' for the product itself, or a product_variants.id for one variant of a variable product.
  variant_key text not null default '',
  quantity numeric(14, 4) not null default 0,
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_branch_stock
  on branch_stock(product_id, variant_key, workspace_id);
create index if not exists idx_branch_stock_org_workspace
  on branch_stock(organization_id, workspace_id);

-- Moving stock from one branch to another. The total never changes; only its split does.
create table if not exists stock_transfers (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  reference varchar(32) not null,
  from_workspace_id uuid not null references workspaces(id),
  to_workspace_id uuid not null references workspaces(id),
  transfer_date date not null,
  notes text not null default '',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists uq_stock_transfers_reference
  on stock_transfers(organization_id, reference);
create index if not exists idx_stock_transfers_org on stock_transfers(organization_id);

create table if not exists stock_transfer_items (
  id uuid primary key,
  transfer_id uuid not null references stock_transfers(id) on delete cascade,
  product_id uuid not null references products(id),
  -- As they were when transferred, so the history reads the same after a rename.
  product_name text not null,
  sku text not null default '',
  quantity numeric(14, 4) not null,
  position integer not null default 0
);
create index if not exists idx_stock_transfer_items_transfer on stock_transfer_items(transfer_id);

-- A per-organization counter for TRF-0001, TRF-0002, ... (same pattern as procurement's).
create table if not exists inventory_code_counters (
  organization_id uuid not null references organizations(id),
  code_type varchar(32) not null,
  next_number bigint not null default 0,
  primary key (organization_id, code_type)
);
