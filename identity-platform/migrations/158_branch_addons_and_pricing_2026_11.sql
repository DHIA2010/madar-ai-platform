-- Branches as an add-on: a package includes some branches (included_branches) and more are bought
-- per branch -- called workspaces in Ads and E-commerce, the same records and the same price (see
-- pricing/service.ts resolvePurchase and subscriptions/branches.ts). A package with no
-- extra-branch price doesn't sell branches. Cashier devices are unlimited within a branch.
alter table platform_packages add column if not exists included_branches integer not null default 1;
-- What a package unlocks beyond its app (subscriptions/entitlements.ts), edited in Madar Admin:
--   invoiceReader  the AI purchase-invoice reader
--   shiftCash      cash movements and the detailed shift report (opening/closing is in every plan)
--   customRoles    custom roles and per-member permissions
--   procurement    suppliers, purchases and expenses without their own subscriptions
--   customReports  the custom report builder without its own subscription
--   maxAdPlatforms ad platforms that can be connected (absent = no limit)
--   maxStores      stores that can be connected (absent = no limit)
alter table platform_packages
  add column if not exists entitlements jsonb not null default '{}'::jsonb;
alter table platform_packages add column if not exists extra_branch_monthly_halalas integer;
alter table platform_packages add column if not exists extra_branch_yearly_halalas integer;

-- Branches paid for on top of those the package includes.
alter table organization_subscriptions
  add column if not exists extra_branches integer not null default 0;

-- A checkout either buys a subscription (with any extra branches) or adds branches to a running
-- one, charged for what's left of its period.
alter table billing_moyasar_payments
  add column if not exists purpose varchar(16) not null default 'subscription';
alter table billing_moyasar_payments
  add column if not exists extra_branches integer not null default 0;

-- Pricing changes shipped with the code are applied once per environment and recorded here --
-- migrations replay on every deploy, and a price edited afterwards in Madar Admin must stay.
create table if not exists platform_pricing_revisions (
  id varchar(64) primary key,
  applied_at timestamptz not null default now()
);

-- November 2026 pricing (approved): per-branch POS packages (every extra branch 99 SAR a month or
-- 999 a year, whatever the package), revised app prices, two months free
-- on yearly. Matches pricing/defaults.ts, which seeds an environment that has no pricing yet.
-- Packages are matched by application and their seeded tier; one that was renamed keeps the name
-- given in Madar Admin only if it no longer has its tier.
update platform_packages set name = 'أساسي', monthly_price_halalas = 14900,
  yearly_price_halalas = 149000, included_branches = 1, extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900,
  is_recommended = false,
  entitlements = '{"shiftCash": true}'::jsonb,
  features = '["فرع واحد (فروع إضافية بـ 99 ر.س/شهر)", "أجهزة كاشير غير محدودة في الفرع", "فواتير معتمدة من هيئة الزكاة (المرحلة الثانية)", "العمل بدون إنترنت", "إدارة الورديات وحركات النقد وتقاريرها", "إدارة المخزون والعملاء", "التقارير الجاهزة"]'::jsonb,
  updated_at = now()
where application = 'pos' and legacy_plan_tier = 'starter'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

update platform_packages set name = 'نمو', monthly_price_halalas = 24900,
  yearly_price_halalas = 249000, included_branches = 2, extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900,
  is_recommended = true,
  entitlements = '{"invoiceReader": true, "shiftCash": true, "customRoles": true, "procurement": true}'::jsonb,
  features = '["كل مزايا الأساسي", "فرعان (فروع إضافية بـ 99 ر.س/شهر)", "أجهزة كاشير غير محدودة في كل فرع", "الأدوار والصلاحيات المخصصة", "الموردون والمشتريات والمصروفات", "قارئ فواتير المشتريات بالذكاء الاصطناعي"]'::jsonb,
  updated_at = now()
where application = 'pos' and legacy_plan_tier = 'growth'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

update platform_packages set name = 'احترافي', monthly_price_halalas = 39900,
  yearly_price_halalas = 399000, included_branches = 3, extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900,
  is_recommended = false,
  entitlements = '{"invoiceReader": true, "shiftCash": true, "customRoles": true, "procurement": true, "customReports": true}'::jsonb,
  features = '["كل مزايا النمو", "3 فروع (فروع إضافية بـ 99 ر.س/شهر)", "أجهزة كاشير غير محدودة في كل فرع", "التقارير المخصصة", "دعم بأولوية"]'::jsonb,
  updated_at = now()
where application = 'pos' and legacy_plan_tier = 'pro'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

update platform_packages set name = 'أساسي', monthly_price_halalas = 14900,
  yearly_price_halalas = 149000, included_branches = 1, extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900,
  is_recommended = false,
  entitlements = '{"maxAdPlatforms": 2}'::jsonb,
  features = '["مساحة عمل واحدة (مساحات إضافية بـ 99 ر.س/شهر)", "منصتان إعلانيتان (مثل ميتا وسناب)", "لوحة موحدة للحملات", "التقارير الجاهزة"]'::jsonb,
  updated_at = now()
where application = 'advertising' and legacy_plan_tier = 'starter'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

update platform_packages set name = 'نمو', monthly_price_halalas = 29900,
  yearly_price_halalas = 299000, included_branches = 2, extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900,
  is_recommended = true,
  entitlements = '{"customRoles": true}'::jsonb,
  features = '["كل مزايا الأساسي", "مساحتان عمل (مساحات إضافية بـ 99 ر.س/شهر)", "كل المنصات الإعلانية: ميتا، جوجل، تيك توك، سناب", "الأدوار والصلاحيات المخصصة"]'::jsonb,
  updated_at = now()
where application = 'advertising' and legacy_plan_tier = 'growth'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

update platform_packages set name = 'احترافي', monthly_price_halalas = 54900,
  yearly_price_halalas = 549000, included_branches = 3, extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900,
  is_recommended = false,
  entitlements = '{"customRoles": true, "customReports": true}'::jsonb,
  features = '["كل مزايا النمو", "3 مساحات عمل (مساحات إضافية بـ 99 ر.س/شهر)", "التقارير المخصصة", "دعم بأولوية"]'::jsonb,
  updated_at = now()
where application = 'advertising' and legacy_plan_tier = 'pro'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

update platform_packages set name = 'أساسي', monthly_price_halalas = 7900,
  yearly_price_halalas = 79000, included_branches = 1, extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900,
  is_recommended = false,
  entitlements = '{"maxStores": 1}'::jsonb,
  features = '["مساحة عمل واحدة (مساحات إضافية بـ 99 ر.س/شهر)", "متجر واحد", "التقارير الجاهزة"]'::jsonb,
  updated_at = now()
where application = 'ecommerce' and legacy_plan_tier = 'starter'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

update platform_packages set name = 'نمو', monthly_price_halalas = 14900,
  yearly_price_halalas = 149000, included_branches = 2, extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900,
  is_recommended = true,
  entitlements = '{"customRoles": true, "maxStores": 3}'::jsonb,
  features = '["كل مزايا الأساسي", "مساحتان عمل (مساحات إضافية بـ 99 ر.س/شهر)", "حتى 3 متاجر", "الأدوار والصلاحيات المخصصة"]'::jsonb,
  updated_at = now()
where application = 'ecommerce' and legacy_plan_tier = 'growth'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

update platform_packages set name = 'احترافي', monthly_price_halalas = 29900,
  yearly_price_halalas = 299000, included_branches = 3, extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900,
  is_recommended = false,
  entitlements = '{"customRoles": true, "customReports": true}'::jsonb,
  features = '["كل مزايا النمو", "3 مساحات عمل (مساحات إضافية بـ 99 ر.س/شهر)", "متاجر غير محدودة", "التقارير المخصصة", "دعم بأولوية"]'::jsonb,
  updated_at = now()
where application = 'ecommerce' and legacy_plan_tier = 'pro'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

-- Promotions and custom reports become one fixed price each, carried by their first package.
update platform_app_pricing set pricing_mode = 'fixed', updated_at = now()
where application in ('promotions', 'customReports')
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');
update platform_packages set name = 'العروض الترويجية', monthly_price_halalas = 5900,
  yearly_price_halalas = 59000, is_recommended = true, is_active = true,
  features = '["خصومات تلقائية في الكاشير", "على كل المنتجات أو منتجات وفئات محددة", "جدولة بالأيام والساعات لكل فرع"]'::jsonb,
  updated_at = now()
where application = 'promotions' and legacy_plan_tier = 'starter'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');
update platform_packages set name = 'التقارير المخصصة', monthly_price_halalas = 7900,
  yearly_price_halalas = 79000, is_recommended = true, is_active = true,
  features = '["منشئ تقارير بالحقول والفلاتر", "حفظ التقارير ومشاركتها", "تصدير التقارير"]'::jsonb,
  updated_at = now()
where application = 'customReports' and legacy_plan_tier = 'starter'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');
update platform_packages set is_active = false, is_recommended = false, updated_at = now()
where application in ('promotions', 'customReports') and legacy_plan_tier in ('growth', 'pro')
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

-- AI: yearly is two months free like everything else.
update platform_packages set yearly_price_halalas = 99000, updated_at = now()
where application = 'ai' and monthly_price_halalas = 9900 and yearly_price_halalas = 99900
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

-- Madar Complete: one branch included, more at the same 99 a month; it unlocks every feature.
update platform_packages set monthly_price_halalas = 89900, yearly_price_halalas = 899000,
  entitlements = '{"invoiceReader": true, "shiftCash": true, "customRoles": true, "procurement": true, "customReports": true}'::jsonb,
  extra_branch_monthly_halalas = 9900, extra_branch_yearly_halalas = 99900, updated_at = now()
where application = 'madarComplete'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-branches');

insert into platform_pricing_revisions (id) values ('2026-11-branches') on conflict (id) do nothing;
