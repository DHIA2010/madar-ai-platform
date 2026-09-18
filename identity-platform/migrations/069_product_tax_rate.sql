-- Per-product tax rate override -- most products use the organization's default rate (Settings ->
-- الضرائب), but some (e.g. an exempt or zero-rated item) need their own. Null means "use whatever
-- the organization's default rate is at the time of each sale" -- never frozen at the product's
-- own creation time, since the whole point of a shared default is that changing it should affect
-- every product that hasn't opted out of it, without having to touch each product row.
--
-- Only native (Madar-authored) products can carry one: a synced Shopify/Salla/Zid product has no
-- row in this table at all, so it always uses the organization's default rate with no way to
-- override it from here.
alter table products add column if not exists tax_rate_id uuid references tax_rates(id);
