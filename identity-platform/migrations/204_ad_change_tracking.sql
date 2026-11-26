-- Ad change tracking: what a media buyer changed in a campaign or an ad set, so the campaign
-- check-up can point at habits that cost money (editing during the learning phase, big budget
-- jumps, bids changed again and again, switching on and off).
--
-- The platforms keep no change history Madar can read for every account, so Madar keeps its
-- own: ad_entity_states holds the last settings seen for each campaign and ad set, and every
-- difference found on the next pass becomes a row in ad_entity_changes.

create table if not exists ad_entity_states (
  -- The campaign or ad set as the performance screens name it, e.g.
  -- snapchat_ads:<connection>:<account>:<id>
  row_id text primary key,
  organization_id uuid not null,
  workspace_id uuid,
  campaign_row_id text not null,
  level varchar(16) not null,
  name text not null,
  settings jsonb not null,
  settings_key text not null,
  -- What the platform says about the learning phase, null when it says nothing.
  learning boolean,
  created_on_platform_at timestamptz,
  first_seen_at timestamptz not null default now(),
  captured_at timestamptz not null default now()
);

create index if not exists idx_ad_entity_states_org on ad_entity_states(organization_id);

create table if not exists ad_entity_changes (
  id uuid primary key,
  organization_id uuid not null,
  workspace_id uuid,
  row_id text not null,
  campaign_row_id text not null,
  level varchar(16) not null,
  name text not null,
  field varchar(32) not null,
  old_value text,
  new_value text,
  -- Whether the ad set was in its learning phase when it was changed, and how that is known
  -- (platform = the platform said so, estimate = new or changed within the last 7 days).
  during_learning boolean,
  learning_source varchar(16),
  changed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_entity_changes_org_time
  on ad_entity_changes(organization_id, changed_at desc);
create index if not exists idx_ad_entity_changes_row on ad_entity_changes(row_id, changed_at desc);
