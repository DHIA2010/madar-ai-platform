-- A "talk to sales" lead can ask for a phone call at a time it picks instead of booking a
-- meeting: kept on the request and on its CRM lead, and logged on the lead's timeline.
alter table sales_leads add column if not exists call_at timestamptz;
alter table sales_leads add column if not exists call_requested_at timestamptz;
alter table crm_leads add column if not exists call_at timestamptz;

-- The one current list of timeline kinds (see 135). Add new kinds here, not in a new copy.
alter table crm_activities drop constraint if exists crm_activities_kind_check;
alter table crm_activities add constraint crm_activities_kind_check check (
  kind in (
    'created', 'note', 'call', 'whatsapp', 'email', 'meeting', 'stage', 'owner',
    'task', 'signup', 'payment', 'quote', 'invoice', 'call_request'
  )
);
