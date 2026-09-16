-- Real region entered when a native customer is created -- shown on the customer statement page.
alter table customers add column if not exists region text;

-- A stable, human-quotable reference -- same pattern as pos_invoices' INV-000123 sequence,
-- instead of exposing the raw uuid id on the customer statement. Only ever set from now on:
-- rows written before this migration are simply left null.
create sequence if not exists customer_wallet_transaction_number_seq;
alter table customer_wallet_transactions add column if not exists reference text;

-- Which real payment method funded a top-up -- meaningless for a 'purchase' row (that money left
-- the wallet itself, it wasn't collected), so this only ever gets set for a 'top_up' row.
alter table customer_wallet_transactions add column if not exists payment_method_code text;
