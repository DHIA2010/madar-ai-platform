-- Campaign Link / Attribution: ad-platform macro capture + storefront snippet support.

-- Advertiser's declared target platform at link-creation time (drives which macro set gets
-- appended to the generated URL). Unconstrained varchar at the DB level, same as
-- campaigns.platform (migration 033) -- validated against CAMPAIGN_PLATFORMS at the Zod layer.
alter table campaign_links add column if not exists platform varchar(32);

-- click_id_platform/platform_* live on the event/attribution row itself, not just on the linked
-- campaign_link -- a snippet-captured touchpoint (external link, or our own FULL_URL link) never
-- has a campaign_link_id to join through, and campaign_links.platform (advertiser intent) can
-- legitimately diverge from click_id_platform (observed reality) even when a campaign_link_id
-- is present, e.g. a short link shared outside its intended ad.
alter table tracking_events
  add column if not exists click_id text,
  add column if not exists click_id_platform varchar(32),
  add column if not exists platform_campaign_id text,
  add column if not exists platform_adgroup_id text,
  add column if not exists platform_keyword text,
  add column if not exists platform_creative_id text;

alter table attributions
  add column if not exists click_id text,
  add column if not exists click_id_platform varchar(32),
  add column if not exists platform_campaign_id text,
  add column if not exists platform_adgroup_id text,
  add column if not exists platform_keyword text,
  add column if not exists platform_creative_id text;

create index if not exists idx_attributions_click_id
  on attributions(click_id) where click_id is not null;

-- Public, revocable identifier the storefront capture snippet embeds client-side -- deliberately
-- not the organization's real UUID, since this is the first unauthenticated write path in the
-- platform that accepts a tenant identifier as untrusted client input. A leaked/abused key can be
-- rotated without touching the org's actual primary key referenced across dozens of tables.
alter table organizations add column if not exists public_tracking_key text;

create unique index if not exists uq_organizations_public_tracking_key
  on organizations(public_tracking_key) where public_tracking_key is not null;
