-- A "stop messaging me" link in the CRM's hand-sent WhatsApp messages: one tap on it, no typing.
-- When it was tapped is kept on the send; the lead itself is tagged (crm/outreach.ts), which is
-- what keeps every later message away from them.
alter table crm_outreach_sends add column if not exists stopped_at timestamptz;
