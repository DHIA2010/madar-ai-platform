-- Leads can now come from the Cal.com booking link itself (source 'booking'), and each lead
-- remembers where its meeting was booked: the website form's booking step or the link directly.
alter table crm_leads drop constraint if exists crm_leads_source_check;
-- 'import' (23 November 2026): leads brought in from a file. Added to this list itself rather
-- than in a later migration, because every migration runs again on each start: this one would
-- put the shorter list back first and fail on the imported leads already there.
alter table crm_leads add constraint crm_leads_source_check
  check (source in ('website', 'signup', 'manual', 'booking', 'import'));
alter table crm_leads add column if not exists meeting_source varchar(16);
