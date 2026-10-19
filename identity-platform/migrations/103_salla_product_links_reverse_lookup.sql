-- Serves "given a Salla product id, is it already linked (and to what)" -- needed by auto-
-- promotion (salla-product-promotion-service.ts) to decide create-vs-update on every sync, and by
-- the Products page's dedup filter (products/service.ts) to exclude an already-promoted synced
-- row. Neither existing index on salla_product_links (migration 101: product_id-partial,
-- variant_id-partial) serves an (org, salla_product_id) lookup.
create index if not exists idx_salla_product_links_org_salla_product
  on salla_product_links(organization_id, salla_product_id);
