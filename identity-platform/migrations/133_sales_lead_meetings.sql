-- The demo meeting a "talk to sales" lead booked on Madar's Cal.com page right after the form.
alter table sales_leads add column if not exists meeting_at timestamptz;
alter table sales_leads add column if not exists meeting_uid varchar(128);
alter table sales_leads add column if not exists meeting_booked_at timestamptz;
