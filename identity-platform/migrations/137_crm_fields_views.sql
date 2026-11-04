-- What a lead wants (Madar apps it's interested in, plus free-form tags), the custom fields Madar's
-- sales team adds to leads, and the filtered views the team saves on the CRM pages.
alter table crm_leads add column if not exists interests jsonb not null default '[]'::jsonb;
alter table crm_leads add column if not exists tags jsonb not null default '[]'::jsonb;
alter table crm_leads add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create table if not exists crm_custom_fields (
  id uuid primary key,
  label varchar(80) not null,
  field_type varchar(16) not null,
  -- The choices of a "select" field.
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint crm_custom_fields_type_check
    check (field_type in ('text', 'number', 'date', 'select', 'checkbox'))
);

create table if not exists crm_saved_views (
  id uuid primary key,
  name varchar(80) not null,
  -- Which CRM page it belongs to.
  page varchar(16) not null,
  -- { conditions: [...], dateRange, groupBy, ... } as the page saved it.
  definition jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint crm_saved_views_page_check check (page in ('leads', 'quotes', 'invoices', 'tasks'))
);
