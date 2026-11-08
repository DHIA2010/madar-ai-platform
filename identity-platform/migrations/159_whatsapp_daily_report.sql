-- The daily store report on WhatsApp (whatsapp/daily-report.ts): each organization chooses
-- whether to receive it, at what time (Riyadh, "HH:MM"), and which numbers it goes to
-- ([{ "phone": "9665...", "name": "..." }]). last_sent_on is the Riyadh day it was last sent --
-- claimed atomically before sending, so several backend tasks never send it twice.
create table if not exists whatsapp_daily_report_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  enabled boolean not null default false,
  send_time text not null default '23:00',
  recipients jsonb not null default '[]'::jsonb,
  last_sent_on date,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_whatsapp_daily_report_enabled
  on whatsapp_daily_report_settings(enabled);
