-- Madar Admin's CRM: the businesses Madar's sales team is working to win. A lead comes from the
-- madar.my "talk to sales" form, from a new sign-up, or is added by hand; it moves through stages
-- to won (it subscribed) or lost.
create table if not exists crm_leads (
  id uuid primary key,
  company_name varchar(160) not null,
  contact_name varchar(160),
  phone varchar(32),
  email varchar(254),
  source varchar(16) not null,
  stage varchar(16) not null default 'new',
  -- The salesperson (a Madar user) responsible for it.
  owner_user_id uuid references users(id),
  -- What the sales team expects it to be worth, and what it actually paid once won (halalas).
  expected_value_halalas integer,
  won_value_halalas integer,
  lost_reason text,
  -- The Madar account it became, and the website request it came from.
  organization_id uuid references organizations(id),
  sales_lead_id uuid references sales_leads(id),
  meeting_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  won_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_leads_source_check check (source in ('website', 'signup', 'manual')),
  constraint crm_leads_stage_check
    check (stage in ('new', 'contacted', 'meeting', 'trial', 'won', 'lost'))
);

create index if not exists idx_crm_leads_stage on crm_leads(stage);
create index if not exists idx_crm_leads_created_at on crm_leads(created_at desc);
create index if not exists idx_crm_leads_organization on crm_leads(organization_id);
create index if not exists idx_crm_leads_sales_lead on crm_leads(sales_lead_id);

-- A lead's timeline: what happened and who did it.
create table if not exists crm_activities (
  id uuid primary key,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  kind varchar(16) not null,
  body text,
  meta jsonb not null default '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  constraint crm_activities_kind_check check (
    kind in (
      'created', 'note', 'call', 'whatsapp', 'email', 'meeting', 'stage', 'owner',
      'task', 'signup', 'payment'
    )
  )
);

create index if not exists idx_crm_activities_lead on crm_activities(lead_id, created_at desc);

-- Follow-ups: something a salesperson has to do for a lead, by a date.
create table if not exists crm_tasks (
  id uuid primary key,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  assignee_user_id uuid references users(id),
  done_at timestamptz,
  done_by_user_id uuid,
  created_by_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_tasks_lead on crm_tasks(lead_id);
create index if not exists idx_crm_tasks_due on crm_tasks(due_at);

-- The Sales staff role: sees only the CRM.
alter table platform_staff drop constraint if exists platform_staff_role_check;
alter table platform_staff add constraint platform_staff_role_check
  check (role in ('super_admin', 'operations', 'finance', 'support', 'sales'));
