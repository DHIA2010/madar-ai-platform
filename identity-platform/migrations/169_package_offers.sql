-- A package can carry an offer: several years bought at once for one price (e.g. two years of
-- POS Basic for 1,699 instead of 2 x 1,490). It is set per package in Madar Admin, never fixed in
-- code: the price, the number of years, the line shown to the customer, and an optional last day.
-- After the offer's years the subscription renews at the package's normal yearly price.
alter table platform_packages add column if not exists offer_price_halalas integer;
alter table platform_packages add column if not exists offer_years integer;
alter table platform_packages add column if not exists offer_title varchar(160);
alter table platform_packages add column if not exists offer_ends_on date;

-- The years an offer purchase paid for (null = an ordinary one-period purchase).
alter table billing_moyasar_payments add column if not exists offer_years integer;

-- The first offer (approved November 2026): two years of POS Basic for 1,699. Applied once per
-- environment; edited or removed afterwards in Madar Admin, it stays as Madar Admin left it.
update platform_packages
   set offer_price_halalas = 169900, offer_years = 2, offer_title = 'عرض السنتين', updated_at = now()
 where application = 'pos' and legacy_plan_tier = 'starter'
   and not exists (select 1 from platform_pricing_revisions where id = '2026-11-two-year-offer');
insert into platform_pricing_revisions (id) values ('2026-11-two-year-offer') on conflict (id) do nothing;
