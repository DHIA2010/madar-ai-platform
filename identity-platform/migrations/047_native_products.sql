-- Native (Madar-owned) product catalogue.
--
-- Until now "products" meant one thing only: the read-only aggregation in products/service.ts
-- over synced salla_records / shopify_records / zid_records. There was no table a product could
-- be written to, which is why the Add Product page had no save path at all.
--
-- These rows are authored in Madar rather than synced from a storefront, so they carry their own
-- lifecycle (draft/active/archived) and are never overwritten by a connector sync.
--
-- Shape: the columns every list/filter/search touches are real columns; everything that exists
-- only for one product type (supplier and batch number for a raw material, booking settings for a
-- service, system requirements for a digital download) lives in `attributes`. Seven product types
-- flattened into columns would be ~30 columns that are null for six types out of seven, and each
-- new type would need another migration.
create table if not exists products (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  product_type varchar(16) not null,
  name text not null,
  -- Null for raw materials and bundles: a bundle is identified by its components and a raw
  -- material by its own stock record, so neither carries a stock code (mirrors
  -- TYPES_WITHOUT_SKU in the Add Product page).
  sku text,
  category text not null default '',
  description text not null default '',
  status varchar(16) not null default 'draft',
  -- Saudi Arabia's currency, matching orders/service.ts's server-side default. Stored per row
  -- rather than read from the org at display time so a price never silently changes meaning if
  -- the organization's currency setting is changed later.
  currency varchar(8) not null default 'SAR',
  base_unit text,
  sell_price numeric(14, 4),
  cost_price numeric(14, 4),
  stock_quantity numeric(14, 4),
  min_stock numeric(14, 4),
  -- Ordered list of already-hosted image URLs; the first is the primary shown in listings.
  image_urls jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint products_type_check check (
    product_type in ('raw', 'simple', 'bundle', 'variable', 'weighted', 'service', 'digital')
  ),
  constraint products_status_check check (status in ('draft', 'active', 'archived')),
  constraint products_sell_price_check check (sell_price is null or sell_price >= 0),
  constraint products_cost_price_check check (cost_price is null or cost_price >= 0),
  constraint products_stock_check check (stock_quantity is null or stock_quantity >= 0)
);

create index if not exists idx_products_org on products(organization_id) where deleted_at is null;
create index if not exists idx_products_org_workspace
  on products(organization_id, workspace_id) where deleted_at is null;
create index if not exists idx_products_org_type
  on products(organization_id, product_type) where deleted_at is null;

-- A stock code has to be unique within the organization to be usable as one. Enforced here as
-- well as in the service so a race between two concurrent creates cannot land two rows on the
-- same code -- the service check alone is a read-then-write with a gap in the middle.
create unique index if not exists uq_products_org_sku
  on products(organization_id, sku) where sku is not null and deleted_at is null;

-- Bundle recipe: one row per component consumed when a bundle unit is sold.
--
-- A component is one of three things, and exactly one of them per row (enforced in the service):
--   * component_ref  -- a product in the catalogue. Text, not a uuid FK, because the catalogue
--                       the picker reads is the aggregation, whose ids are provider-prefixed
--                       ("salla:123"); a native component is stored as its own uuid in text form.
--   * custom_name    -- named by hand, for a recipe defined before its raw materials exist.
-- required_unit/stock_unit are kept as authored: a recipe in grams against stock counted in
-- kilos is the normal case, and conversion_factor carries the pairing no formula can bridge
-- (how many stock units make one recipe unit) for cross-dimension pairs like حبة against كجم.
create table if not exists product_components (
  id uuid primary key,
  product_id uuid not null references products(id) on delete cascade,
  component_ref text,
  custom_name text,
  custom_stock numeric(14, 4),
  required_quantity numeric(14, 4) not null,
  required_unit varchar(16) not null,
  stock_unit varchar(16) not null,
  conversion_factor numeric(14, 6),
  note text,
  position integer not null default 0,
  constraint product_components_quantity_check check (required_quantity > 0),
  constraint product_components_conversion_check check (
    conversion_factor is null or conversion_factor > 0
  ),
  constraint product_components_source_check check (
    (component_ref is not null and custom_name is null)
    or (component_ref is null and custom_name is not null)
  )
);

create index if not exists idx_product_components_product on product_components(product_id);

-- Variable products: the option axes (المقاس, اللون) whose cartesian product forms the variants.
-- `option_values` is a json array of the option's values in author order -- a child table would
-- buy nothing, since values are only ever read and written as a whole list.
create table if not exists product_variant_options (
  id uuid primary key,
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  option_values jsonb not null default '[]'::jsonb,
  position integer not null default 0
);

create index if not exists idx_product_variant_options_product
  on product_variant_options(product_id);

-- One row per sellable combination. Only the combinations the author kept are stored: the page
-- lets a combination be excluded (not every size comes in every colour), so this is a subset of
-- the full cartesian product, not a mirror of it.
create table if not exists product_variants (
  id uuid primary key,
  product_id uuid not null references products(id) on delete cascade,
  sku text,
  price numeric(14, 4),
  stock numeric(14, 4),
  option_values jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  constraint product_variants_price_check check (price is null or price >= 0),
  constraint product_variants_stock_check check (stock is null or stock >= 0)
);

create index if not exists idx_product_variants_product on product_variants(product_id);

create unique index if not exists uq_product_variants_org_sku
  on product_variants(product_id, sku) where sku is not null;
