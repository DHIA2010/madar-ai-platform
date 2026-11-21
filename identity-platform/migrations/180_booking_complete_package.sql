-- Booking is sold as one package with everything (decided 21 November 2026): 299 SAR a month,
-- 2,999 a year, every Booking feature, with Loyalty and the cashier included
-- (subscriptions/types.ts's INCLUDED_APPLICATIONS switches them on with it), the cashier's shift
-- reports, custom roles and custom reports, one branch, and more branches as the usual add-on
-- (99 a month, 999 a year). Matches pricing/defaults.ts, which seeds an environment that has no
-- pricing yet. Applied once per environment: afterwards the package stays as Madar Admin left it.
update platform_packages set name = 'الحجوزات الشاملة', monthly_price_halalas = 29900,
  yearly_price_halalas = 299900, included_branches = 1, extra_branch_monthly_halalas = 9900,
  extra_branch_yearly_halalas = 99900, is_recommended = true, is_active = true,
  entitlements = '{"shiftCash": true, "customRoles": true, "customReports": true}'::jsonb,
  features = '["صفحة حجز خاصة بنشاطك يحجز منها العميل بنفسه", "خدمات ومقدمو خدمة بأوقات دوام وإجازات لكل واحد", "تقويم يومي يمنع تعارض المواعيد", "قائمة الانتظار والعروض والباقات وتقييمات العملاء", "تأكيد وتذكير العميل عبر واتساب، ودخوله لحجوزاته برمز واتساب", "تقارير الحجوزات والإيراد وأوقات الذروة", "تطبيق الولاء مشمول: نقاط ومكافآت وبطاقة ولاء بإشعارات", "الكاشير مشمول: بيع وفواتير معتمدة من هيئة الزكاة وورديات ومخزون", "استخدام مكافآت الولاء داخل الكاشير", "أدوار وصلاحيات مخصصة وتقارير مخصصة", "فرع واحد (فروع إضافية بـ 99 ر.س/شهر أو 999 ر.س/سنة)", "التقرير اليومي على واتساب مجانًا (رقم واحد، مرة يوميًا)"]'::jsonb,
  updated_at = now()
where application = 'booking'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-booking-complete');

insert into platform_pricing_revisions (id) values ('2026-11-booking-complete') on conflict (id) do nothing;
