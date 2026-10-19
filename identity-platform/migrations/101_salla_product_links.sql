-- Links a native Madar product (or one specific variant of it) to a Salla product, so selling
-- the Madar side through a Madar order or a POS invoice can push a stock update to Salla too.
-- See salla-stock-push-service.ts for the push itself; this table only records the mapping.
create table if not exists salla_product_links (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  product_id uuid not null references products(id) on delete cascade,
  -- Null = a product-level link (the whole product maps to one Salla product). Set = a
  -- variant-level link (this exact size/color combination maps to that Salla product) --
  -- product_id is still always the variant's own parent, so "every link touching this product"
  -- never needs a second join. A product is linked at exactly one of these two levels, never
  -- both -- enforced in the service (salla-product-links-service.ts), not here, the same split
  -- product_components_source_check documents for its own either/or columns.
  variant_id uuid references product_variants(id) on delete cascade,
  salla_product_id text not null,
  -- Snapshot at link time, for display/debugging only -- never re-read to decide what to push
  -- (the push always resolves the connection and re-reads Madar's own current stock fresh).
  salla_product_sku text,
  salla_product_name text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One product-level link per product...
create unique index if not exists uq_salla_product_links_product
  on salla_product_links(product_id) where variant_id is null;
-- ...or one link per variant -- never both for the same product.
create unique index if not exists uq_salla_product_links_variant
  on salla_product_links(variant_id) where variant_id is not null;

create index if not exists idx_salla_product_links_org on salla_product_links(organization_id);
