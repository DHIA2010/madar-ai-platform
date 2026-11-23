-- An "I'm interested" link in the CRM's hand-sent WhatsApp messages: one tap, no form (the
-- lead's name and number are already known). When it was tapped is kept on the send.
alter table crm_outreach_sends add column if not exists interested_at timestamptz;
