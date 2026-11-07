-- Whether a promotion's fixed amount (and its per-item cap) includes VAT -- the cashier converts it
-- to net with each item's own rate. Existing promotions keep reading as VAT-inclusive.
alter table promotions add column if not exists amount_includes_tax boolean not null default true;
