-- Which specific combination of a "variable" product (size/color etc.) a sale/return line
-- actually was -- product_id alone is never enough for a variable product, since it never
-- carries any stock of its own (see product_variants.stock, migration 047). Needed so
-- PosInvoicesService.computeStockConsumption can decrement/restore the exact variant sold,
-- not just its parent product.
alter table pos_invoice_items add column if not exists variant_id uuid references product_variants(id);
alter table pos_invoice_return_items add column if not exists variant_id uuid references product_variants(id);
