-- E-commerce is sold as one package with everything (decided 21 November 2026): 299 SAR a
-- month, 2,990 a year, every store, custom roles and reports, one workspace, and more workspaces
-- as the usual add-on (99 a month, 999 a year). Matches pricing/defaults.ts, which seeds an
-- environment that has no pricing yet. Applied once per environment: afterwards the package stays
-- as Madar Admin left it. The two smaller packages are switched off rather than removed, so
-- anything that refers to them still finds them.
update platform_packages set name = 'الباقة الشاملة', monthly_price_halalas = 29900,
  yearly_price_halalas = 299000, included_branches = 1, extra_branch_monthly_halalas = 9900,
  extra_branch_yearly_halalas = 99900, is_recommended = true, is_active = true, sort_order = 0,
  entitlements = '{"customRoles": true, "customReports": true}'::jsonb,
  features = '["ربط متجرك بضغطة واحدة (سلة، زد، Shopify وغيرها)", "متاجر غير محدودة", "لوحة مبيعات المتجر: الطلبات والإيرادات ومتوسط قيمة الطلب", "متابعة المنتجات والطلبات والعملاء", "الزوار المباشرون على المتجر", "تتبع مصدر كل طلب (UTM ومعرّفات النقر)", "التقارير الجاهزة والتقارير المخصصة", "أدوار وصلاحيات مخصصة لفريقك", "مساحة عمل واحدة (مساحات إضافية بـ 99 ر.س/شهر أو 999 ر.س/سنة)", "دعم بأولوية", "التقرير اليومي على واتساب مجانًا (رقم واحد، مرة يوميًا)"]'::jsonb,
  updated_at = now()
where application = 'ecommerce' and legacy_plan_tier = 'pro'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-ecommerce-single');

update platform_packages set is_active = false, is_recommended = false, updated_at = now()
where application = 'ecommerce' and legacy_plan_tier in ('starter', 'growth')
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-ecommerce-single');

insert into platform_pricing_revisions (id) values ('2026-11-ecommerce-single') on conflict (id) do nothing;
