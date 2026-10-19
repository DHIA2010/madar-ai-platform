-- Zid's own salla_product_links equivalent -- links a native Madar product (or one specific
-- variant of it) to a Zid product, so selling the Madar side through a Madar order or POS invoice
-- can push a stock update to Zid too. See zid-stock-push-service.ts (follow-up) and
-- zid-product-promotion-service.ts for the write side; this table only records the mapping.
-- Kept as its own table rather than a shared/polymorphic one, matching this codebase's existing
-- provider-per-table convention (salla_records/zid_records are likewise separate tables, not one).
create table if not exists zid_product_links (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  product_id uuid not null references products(id) on delete cascade,
  -- Null = a product-level link. Set = a variant-level link -- product_id is still always the
  -- variant's own parent. A product is linked at exactly one of these two levels, never both --
  -- enforced in the service (zid-product-links-service.ts), not here, same split
  -- salla_product_links documents for its own either/or columns.
  variant_id uuid references product_variants(id) on delete cascade,
  zid_product_id text not null,
  zid_product_sku text,
  zid_product_name text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_zid_product_links_product
  on zid_product_links(product_id) where variant_id is null;
create unique index if not exists uq_zid_product_links_variant
  on zid_product_links(variant_id) where variant_id is not null;
create index if not exists idx_zid_product_links_org on zid_product_links(organization_id);
create index if not exists idx_zid_product_links_org_zid_product
  on zid_product_links(organization_id, zid_product_id);
