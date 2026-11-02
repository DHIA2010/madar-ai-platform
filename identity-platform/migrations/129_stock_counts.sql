-- Stock take (جرد المخزون): counting what's really on a branch's shelves. A count starts as a
-- draft the team fills in over time; approving it sets each counted product's stock in that
-- branch to the counted quantity (see inventory/stock-counts-service.ts).
create table if not exists stock_counts (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  reference varchar(32) not null,
  workspace_id uuid not null references workspaces(id),
  count_date date not null,
  status varchar(16) not null default 'draft',
  notes text not null default '',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_by uuid references users(id),
  completed_at timestamptz
);
alter table stock_counts drop constraint if exists stock_counts_status_check;
alter table stock_counts add constraint stock_counts_status_check
  check (status in ('draft', 'completed'));
create unique index if not exists uq_stock_counts_reference
  on stock_counts(organization_id, reference);
create index if not exists idx_stock_counts_org on stock_counts(organization_id);

create table if not exists stock_count_items (
  id uuid primary key,
  count_id uuid not null references stock_counts(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  sku text not null default '',
  -- The branch's quantity in Madar: as last saved for a draft, and at approval for a completed
  -- count (which is what the difference was applied against).
  system_quantity numeric(14, 4) not null default 0,
  counted_quantity numeric(14, 4) not null,
  -- The product's cost when counted, to value the difference.
  unit_cost numeric(14, 4),
  position integer not null default 0
);
create index if not exists idx_stock_count_items_count on stock_count_items(count_id);
