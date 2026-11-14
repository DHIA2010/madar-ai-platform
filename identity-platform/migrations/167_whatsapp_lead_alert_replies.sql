-- When each of Madar's team numbers last wrote to Madar's WhatsApp number (a reply or a tap on a
-- button). For 24 hours after that, Meta lets Madar message the number directly -- no template, so
-- no marketing cap -- and the lead alerts go out that way (whatsapp/lead-alerts.ts). reminded_at is
-- when the number was last asked to tap again before those 24 hours run out.
create table if not exists whatsapp_lead_alert_replies (
  phone text primary key,
  last_reply_at timestamptz not null,
  reminded_at timestamptz
);
