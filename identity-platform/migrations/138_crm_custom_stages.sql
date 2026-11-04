-- Stages Madar's sales team adds to the pipeline, between the built-in ones (which stay: the
-- website form, a booked demo, a sign-up and a payment move leads through them automatically).
alter table crm_leads drop constraint if exists crm_leads_stage_check;
alter table crm_leads alter column stage type varchar(40);

create table if not exists crm_stages (
  key varchar(40) primary key,
  label varchar(60) not null,
  color varchar(16) not null default 'slate',
  -- Where it sits: the built-in stages are new 100, contacted 200, meeting 300, trial 400,
  -- won/lost 1000; custom stages take the numbers in between.
  position integer not null,
  created_at timestamptz not null default now()
);
