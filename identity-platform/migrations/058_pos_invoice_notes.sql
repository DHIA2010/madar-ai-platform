-- An optional note typed on the cart before checkout (e.g. "no ice", "gift wrap") -- carried
-- through to the invoice it produces so it isn't lost the moment the sale completes.
alter table pos_invoices add column if not exists notes text;
