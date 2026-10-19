-- Which specific combination of a "variable" product (size/color etc.) a Madar order line
-- actually was -- mirrors migration 080's pos_invoice_items.variant_id exactly, for the same
-- reason: product_id alone is never enough for a variable product, since it never carries any
-- stock of its own (see product_variants.stock, migration 047).
alter table madar_order_items add column if not exists variant_id uuid references product_variants(id);
