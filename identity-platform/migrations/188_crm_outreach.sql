-- WhatsApp outreach from Madar Admin's CRM, sent by hand: a salesperson writes one message,
-- then presses "send" on each lead, which opens their own WhatsApp with the message written and
-- a link of that lead's own. The link is what can be counted (WhatsApp says nothing about a
-- message sent by hand): each send has a code, and a tap on its link is recorded against it.
--
-- The stage a new lead moves to when its message goes out ("whatsapp_sent") is an ordinary custom
-- stage, made by the code the first time a message is sent (crm/outreach.ts), not here: every
-- migration runs again on each start, and that would bring it back after the team removed it.
create table if not exists crm_outreach_campaigns (
  id uuid primary key,
  name text not null,
  -- The message, with {الاسم} / {النشاط} / {الرابط} filled in for each lead.
  message text not null,
  -- Where the lead's link leads, and what the link's card in the chat shows.
  link_url text not null,
  link_title text,
  link_description text,
  image_url text,
  -- How many may be sent in one day, so the sender's number is not flagged.
  daily_limit integer not null default 20,
  created_by uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists crm_outreach_sends (
  id uuid primary key,
  campaign_id uuid not null,
  lead_id uuid not null,
  code varchar(16) not null,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  clicks integer not null default 0,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  replied_at timestamptz
);
create unique index if not exists uq_crm_outreach_sends_code on crm_outreach_sends(code);
create unique index if not exists uq_crm_outreach_sends_lead on crm_outreach_sends(campaign_id, lead_id);
