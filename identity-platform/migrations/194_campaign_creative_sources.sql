-- Where a creative in the library came from, and which ads on the ad platforms show it
-- (campaigns/creative-import.ts).
--
-- A creative is either uploaded in Madar ('upload') or brought in from an ad that already runs on
-- an ad platform ('snapchat': the ad's own image or video, copied into Madar's storage). The
-- source media id is the platform's id for that file, so the same file is never brought in twice.
alter table campaign_creatives add column if not exists source varchar(16) not null default 'upload';
alter table campaign_creatives add column if not exists source_connection_id uuid;
alter table campaign_creatives add column if not exists source_account_id text;
alter table campaign_creatives add column if not exists source_media_id text;
create index if not exists idx_campaign_creatives_source_media
  on campaign_creatives(organization_id, source_media_id);

-- One row per ad on an ad platform: the library creative it shows. creative_id is empty when the
-- ad's file could not be brought in (skipped_reason says why), so it is not tried again on every
-- visit.
create table if not exists campaign_creative_ads (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  creative_id uuid references campaign_creatives(id) on delete cascade,
  platform varchar(16) not null,
  connection_id uuid not null,
  account_id text not null,
  ad_id text not null,
  platform_creative_id text,
  media_id text,
  skipped_reason text,
  created_at timestamptz not null default now(),
  unique (platform, connection_id, ad_id)
);
create index if not exists idx_campaign_creative_ads_creative
  on campaign_creative_ads(creative_id);
create index if not exists idx_campaign_creative_ads_org
  on campaign_creative_ads(organization_id);
