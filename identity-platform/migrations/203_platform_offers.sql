-- Offers (العروض): a limited-time deal Madar Admin switches on and off -- several years of a
-- package for one price, with other apps and add-ons included free for the same years. The
-- customer buys it once from the apps page and everything in it is switched on.
create table if not exists platform_offers (
  id uuid primary key,
  title text not null,
  subtitle text,
  application varchar(32) not null default 'pos',
  -- The package bought. Empty = the application's dearest active package.
  package_id uuid,
  price_halalas integer not null,
  years integer not null default 1,
  -- Apps and add-ons switched on free for the same years.
  bonus_applications jsonb not null default '[]'::jsonb,
  bonus_addons jsonb not null default '[]'::jsonb,
  -- What the offer card lists.
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  -- The last day it can be bought (Riyadh time), empty = until switched off.
  ends_on date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The offer a payment bought, so its included apps are switched on with it.
alter table billing_moyasar_payments add column if not exists offer_id uuid;

-- Blue Friday: two years of the cashier (the first paid, the second free) with Accounting,
-- Promotions and the WhatsApp daily report included.
insert into platform_offers
  (id, title, subtitle, application, price_halalas, years, bonus_applications, bonus_addons,
   features, is_active, sort_order)
select 'b0f00000-0000-4000-8000-000000000001', 'عرض الجمعة الزرقاء',
       'السنة الأولى مدفوعة والسنة الثانية مجاناً', 'pos', 169900, 2,
       '["accounting", "promotions"]'::jsonb, '["whatsapp_daily_report"]'::jsonb,
       '["فواتير على الواتساب", "تقرير يومي واتساب", "تقارير متقدمة ومخصصة", "إدارة الموردين", "إدارة المصروفات", "المحاسبة", "تطبيق العروض", "صلاحيات متقدمة"]'::jsonb,
       true, 0
where not exists (select 1 from platform_offers where id = 'b0f00000-0000-4000-8000-000000000001');
