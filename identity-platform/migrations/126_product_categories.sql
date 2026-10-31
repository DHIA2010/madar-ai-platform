-- Product categories a workspace manages (Products -> Categories). Products still carry their
-- category as text (products.category, and each store's own synced data); a row here exists for a
-- category created in Madar, or once a category's status has been changed. An inactive category,
-- and its products, are hidden from the cashier.
create table if not exists product_categories (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  -- workspace_id, or 'organization' for an organization-wide list -- a plain column so the unique
  -- index below works the same everywhere (no expression index).
  scope_key text not null,
  name text not null,
  name_key text not null,
  source varchar(16) not null default 'madar',
  status varchar(16) not null default 'active',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_source_check check (source in ('madar', 'salla', 'zid', 'shopify')),
  constraint product_categories_status_check check (status in ('active', 'inactive'))
);

create unique index if not exists uq_product_categories_scope_name
  on product_categories(organization_id, scope_key, name_key);
