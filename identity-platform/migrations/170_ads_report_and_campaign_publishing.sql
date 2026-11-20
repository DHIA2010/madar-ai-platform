-- The daily ads report on WhatsApp (whatsapp/ads-report.ts): each organization chooses whether to
-- receive it, at what time (Riyadh, "HH:MM"), and which numbers it goes to
-- ([{ "phone": "9665...", "name": "..." }]). last_sent_on is the Riyadh day it was last sent --
-- claimed atomically before sending, so several backend tasks never send it twice.
create table if not exists whatsapp_ads_report_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  enabled boolean not null default false,
  send_time text not null default '09:00',
  recipients jsonb not null default '[]'::jsonb,
  last_sent_on date,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_whatsapp_ads_report_enabled
  on whatsapp_ads_report_settings(enabled);

-- The creative library (campaigns/creatives.ts): the images and videos an organization keeps for
-- its ads. The file itself sits in object storage under storage_key. Width, height and duration
-- are read in the browser at upload and decide which ad platforms can take it.
create table if not exists campaign_creatives (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid,
  name text not null,
  kind varchar(8) not null,
  content_type text not null,
  size_bytes integer not null,
  width integer,
  height integer,
  duration_seconds numeric(8, 2),
  storage_key text not null,
  url text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_campaign_creatives_org
  on campaign_creatives(organization_id, created_at desc);

-- A campaign published from Madar to an ad platform (campaigns/publishing): what was asked for,
-- how far the publish got, and the ids the platform gave back for each piece. status is
-- "publishing" while the steps run, then "published" or "failed" (with the reason the platform
-- gave). platform_status is the switch of the campaign on the platform ("active" or "paused").
create table if not exists campaign_publications (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid,
  platform varchar(32) not null,
  connection_id uuid not null,
  ad_account_id text not null,
  name text not null,
  objective varchar(16) not null,
  currency varchar(3),
  daily_budget numeric(12, 2) not null,
  start_at timestamptz not null,
  end_at timestamptz,
  targeting jsonb not null default '{}'::jsonb,
  creative_id uuid,
  brand_name text not null,
  headline text not null,
  call_to_action varchar(32) not null,
  destination_url text not null,
  status varchar(16) not null default 'publishing',
  platform_status varchar(16) not null default 'paused',
  external_ids jsonb not null default '{}'::jsonb,
  error text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_campaign_publications_org
  on campaign_publications(organization_id, created_at desc);
