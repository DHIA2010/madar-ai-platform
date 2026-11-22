-- Booking no longer brings the whole cashier (decided 22 November 2026): it brings Loyalty, and
-- from the cashier only what a finished visit needs -- its tax invoice (reported to ZATCA like
-- any sale), the invoices list and returns. subscriptions/types.ts's INCLUDED_APPLICATIONS and
-- subscriptions/app-access.ts carry the rule; this brings the stored package in line (the
-- cashier's shift reports leave it) and makes "an invoice with every finished visit" the way
-- Booking starts, switching it on once for the businesses already using Booking, who can switch
-- it back off in their booking settings. Applied once per environment.
alter table booking_settings alter column invoice_on_completion set default true;

update booking_settings set invoice_on_completion = true
where not exists (select 1 from platform_pricing_revisions where id = '2026-11-booking-invoices-only');

update platform_packages set
  entitlements = '{"customRoles": true, "customReports": true}'::jsonb,
  features = '["صفحة حجز خاصة بنشاطك يحجز منها العميل بنفسه", "خدمات ومقدمو خدمة بأوقات دوام وإجازات لكل واحد", "تقويم يومي يمنع تعارض المواعيد", "قائمة الانتظار والعروض والباقات وتقييمات العملاء", "تأكيد وتذكير العميل عبر واتساب، ودخوله لحجوزاته برمز واتساب", "تقارير الحجوزات والإيراد وأوقات الذروة", "تطبيق الولاء مشمول: نقاط ومكافآت وبطاقة ولاء بإشعارات", "فاتورة ضريبية معتمدة من هيئة الزكاة تصدر تلقائيًا عند إتمام الخدمة", "طباعة الفاتورة أو إرسالها للعميل عبر واتساب، مع المرتجعات", "أدوار وصلاحيات مخصصة وتقارير مخصصة", "فرع واحد (فروع إضافية بـ 99 ر.س/شهر أو 999 ر.س/سنة)", "التقرير اليومي على واتساب مجانًا (رقم واحد، مرة يوميًا)"]'::jsonb,
  updated_at = now()
where application = 'booking'
  and not exists (select 1 from platform_pricing_revisions where id = '2026-11-booking-invoices-only');

insert into platform_pricing_revisions (id) values ('2026-11-booking-invoices-only') on conflict (id) do nothing;
