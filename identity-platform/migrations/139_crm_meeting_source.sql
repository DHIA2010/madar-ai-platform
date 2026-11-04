-- Leads can now come from the Cal.com booking link itself (source 'booking'), and each lead
-- remembers where its meeting was booked: the website form's booking step or the link directly.
alter table crm_leads drop constraint if exists crm_leads_source_check;
alter table crm_leads add constraint crm_leads_source_check
  check (source in ('website', 'signup', 'manual', 'booking'));
alter table crm_leads add column if not exists meeting_source varchar(16);
