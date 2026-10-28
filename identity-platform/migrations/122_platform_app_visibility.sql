-- Madar Admin can hide an application from the customer marketplace (Packages page). Hidden apps
-- can't be bought, requested, or trialled; customers who already have one keep it.
alter table platform_app_pricing add column if not exists is_visible boolean not null default true;
