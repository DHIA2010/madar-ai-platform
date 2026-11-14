-- Invoicing & Quotations stays an app of its own, and now also comes with POS احترافي (and Madar
-- Complete, which unlocks everything): the package's "invoicing" switch opens it without a
-- subscription of its own (subscriptions/entitlements.ts, app-access.ts). Editable per package in
-- Madar Admin afterwards, so this runs once.
update platform_packages
   set entitlements = entitlements || '{"invoicing": true}'::jsonb,
       features = features || '["تطبيق الفواتير وعروض الأسعار"]'::jsonb,
       updated_at = now()
 where application = 'pos' and legacy_plan_tier = 'pro'
   and not exists (select 1 from platform_pricing_revisions where id = '2026-11-invoicing-in-pos-pro');

update platform_packages
   set entitlements = entitlements || '{"invoicing": true}'::jsonb, updated_at = now()
 where application = 'madarComplete'
   and not exists (select 1 from platform_pricing_revisions where id = '2026-11-invoicing-in-pos-pro');

insert into platform_pricing_revisions (id) values ('2026-11-invoicing-in-pos-pro')
on conflict (id) do nothing;
