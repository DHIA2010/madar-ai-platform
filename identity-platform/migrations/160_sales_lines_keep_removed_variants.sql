-- A sales line kept a hard reference to the variant it sold (migrations 080, 102), so a variant
-- that was ever sold could never be removed from its product: editing the product's options, or a
-- storefront sync that dropped the variant, failed on the foreign key. The line already carries
-- its own product name and sku, so it survives the variant going -- it just stops pointing at it.
-- (Postgres names the original constraint *_fkey; the pg-mem test database names it *_fk.)
alter table madar_order_items drop constraint if exists madar_order_items_variant_id_fkey;
alter table madar_order_items drop constraint if exists madar_order_items_variant_id_fk;
alter table madar_order_items
  add constraint madar_order_items_variant_id_fkey
  foreign key (variant_id) references product_variants(id) on delete set null;

alter table pos_invoice_items drop constraint if exists pos_invoice_items_variant_id_fkey;
alter table pos_invoice_items drop constraint if exists pos_invoice_items_variant_id_fk;
alter table pos_invoice_items
  add constraint pos_invoice_items_variant_id_fkey
  foreign key (variant_id) references product_variants(id) on delete set null;

alter table pos_invoice_return_items drop constraint if exists pos_invoice_return_items_variant_id_fkey;
alter table pos_invoice_return_items drop constraint if exists pos_invoice_return_items_variant_id_fk;
alter table pos_invoice_return_items
  add constraint pos_invoice_return_items_variant_id_fkey
  foreign key (variant_id) references product_variants(id) on delete set null;
