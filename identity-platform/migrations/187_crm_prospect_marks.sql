-- The sales team's prospect finder (crm/prospects.ts) searches Google Maps live and keeps none
-- of what Google returns. This is the one thing kept: against a place's Google id, how the
-- team's contact with that business went, so nobody is called twice.
create table if not exists crm_prospect_marks (
  place_id text primary key,
  status varchar(20) not null,
  note text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
