-- Per-line net (taxable) amount and VAT, computed once at sale time in invoices-service.ts's
-- create() and stored so a reprint always shows the exact figures a Simplified Tax Invoice's
-- line-item breakdown needs (net unit price, VAT, and total incl. VAT) -- not an approximation
-- reverse-engineered later from unit_price/line_total, which cannot correctly account for
-- gross/net product pricing, a per-product tax-rate override, or this line's own share of the
-- order-wide discount (migration 071's own item-level discount_amount already exists, but only
-- covers this line's OWN discount, not its share of the order-wide one).
--
-- unit_price and line_total (see migration 055/060) are still never touched by any of this --
-- they stay exactly what was actually charged per unit, unaffected by tax or any discount.
alter table pos_invoice_items add column if not exists net_amount numeric(12, 2) not null default 0;
alter table pos_invoice_items add column if not exists tax_amount numeric(12, 2) not null default 0;
