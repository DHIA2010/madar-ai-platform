-- Paid add-ons bought on their own, independent of any app package (subscriptions/addons.ts) --
-- the first being the WhatsApp daily report's paid plan: more numbers, up to three sends a day,
-- and a period of the merchant's choosing for each. Every package includes the free report (one
-- number, one send a day). The price is edited in Madar Admin.
create table if not exists platform_addons (
  code varchar(64) primary key,
  monthly_price_halalas integer not null,
  yearly_price_halalas integer not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null
);

insert into platform_addons (code, monthly_price_halalas, yearly_price_halalas)
values ('whatsapp_daily_report', 7000, 75000)
on conflict (code) do nothing;

-- An organization's add-on: running until current_period_end, extended by each payment.
create table if not exists organization_addons (
  organization_id uuid not null references organizations(id) on delete cascade,
  addon_code varchar(64) not null,
  billing_interval varchar(8) not null default 'monthly',
  current_period_end timestamptz not null,
  -- "payment" (bought) or "grant" (given in Madar Admin).
  source varchar(16) not null default 'payment',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, addon_code)
);

-- A checkout can now buy an add-on.
alter table billing_moyasar_payments add column if not exists addon_code varchar(64);

-- Up to three sends a day, each {sendTime, from, to} ("HH:MM", Riyadh) -- from/to are null for
-- the automatic period. Empty means the single send_time below (rows from before this).
alter table whatsapp_daily_report_settings
  add column if not exists schedules jsonb not null default '[]'::jsonb;

-- Each scheduled send claimed for a day, so several backend tasks never send it twice.
create table if not exists whatsapp_daily_report_sends (
  organization_id uuid not null references organizations(id) on delete cascade,
  slot varchar(32) not null,
  sent_at timestamptz not null default now(),
  primary key (organization_id, slot)
);


-- Every app package (POS, ads, e-commerce, Madar Complete) lists the free WhatsApp daily report
-- -- the paid add-on is offered only from Settings, never while buying an app. Once per
-- environment, so a package edited in Madar Admin later keeps its own list. Same line as
-- pricing/defaults.ts's DAILY_REPORT_FEATURE.
update platform_packages
   set features = features || '["التقرير اليومي على واتساب مجانًا (رقم واحد، مرة يوميًا)"]'::jsonb,
       updated_at = now()
 where application in ('pos', 'advertising', 'ecommerce', 'madarComplete')
   and not exists (select 1 from platform_pricing_revisions where id = '2026-11-daily-report');

insert into platform_pricing_revisions (id) values ('2026-11-daily-report')
on conflict (id) do nothing;
