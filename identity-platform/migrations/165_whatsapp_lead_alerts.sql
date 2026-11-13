-- The numbers of Madar's own team that get a WhatsApp alert when a new lead arrives -- a "talk to
-- sales" request from madar.my or a new account (whatsapp/lead-alerts.ts). Set in Madar Admin ->
-- settings -> WhatsApp; empty means no alerts.
alter table whatsapp_platform_config
  add column if not exists lead_alert_phones jsonb not null default '[]'::jsonb;
