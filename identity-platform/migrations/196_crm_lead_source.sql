-- Where a lead came from, as the sales team names it (Snapchat, Google, a referral...). Chosen by
-- hand when a lead is added or imported; empty means "work it out from the lead's ad tags".
alter table crm_leads add column if not exists lead_source varchar(80);

-- The names offered in the "lead source" dropdown. A new one typed there is added here.
create table if not exists crm_lead_sources (
  name varchar(80) primary key,
  position integer not null default 1000,
  created_at timestamptz not null default now()
);

insert into crm_lead_sources (name, position) values
  ('سناب شات', 1),
  ('جوجل', 2),
  ('تيك توك', 3),
  ('ميتا', 4),
  ('واتساب', 5),
  ('إكس', 6),
  ('توصية', 7),
  ('زيارة ميدانية', 8)
on conflict (name) do nothing;
