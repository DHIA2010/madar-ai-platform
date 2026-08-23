-- Campaign Link / Attribution: core entities.
-- Campaigns are kept strictly separate from Campaign Links (a campaign is the
-- advertising-side grouping; a campaign link is the tracked URL under it).

create table if not exists campaigns (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  source varchar(16) not null,
  platform varchar(32),
  advertising_account_id text,
  external_campaign_id text,
  display_name text not null,
  normalized_name text not null,
  status varchar(16) not null default 'active',
  objective text,
  budget_currency varchar(8),
  budget_amount numeric(14, 2),
  start_date date,
  end_date date,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint campaigns_source_check check (source in ('native', 'imported')),
  constraint campaigns_status_check check (status in ('active', 'paused', 'archived')),
  constraint campaigns_imported_fields_check check (
    source = 'native' or (platform is not null and advertising_account_id is not null and external_campaign_id is not null)
  )
);

create index if not exists idx_campaigns_org on campaigns(organization_id) where deleted_at is null;
create index if not exists idx_campaigns_workspace on campaigns(workspace_id) where deleted_at is null;

-- Imported campaigns are identity-keyed by their external platform ID, never by name,
-- so re-running an import sync updates the existing row instead of duplicating it. Deliberately
-- a plain (non-partial) unique index, not filtered by deleted_at is null -- NULLs in
-- platform/advertising_account_id/external_campaign_id (native campaigns) are never considered
-- equal to each other under a unique constraint, so this doesn't collide native campaigns with
-- each other; a partial-predicate index would also block ON CONFLICT ... DO UPDATE inference.
create unique index if not exists uq_campaigns_external
  on campaigns(organization_id, platform, advertising_account_id, external_campaign_id);

create table if not exists campaign_links (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  campaign_id uuid not null references campaigns(id),
  display_id varchar(24) not null,
  name text not null,
  tracking_type varchar(16) not null,
  destination_base_url text not null,
  final_url text not null,
  short_url text,
  utm_source text not null,
  utm_medium text not null,
  utm_campaign text not null,
  utm_content text,
  utm_term text,
  ad_group_name text,
  ad_name text,
  custom_params jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint campaign_links_tracking_type_check check (tracking_type in ('FULL_URL', 'SHORT_LINK')),
  constraint campaign_links_destination_https_check check (destination_base_url like 'https://%'),
  constraint campaign_links_final_url_https_check check (final_url like 'https://%'),
  constraint campaign_links_short_url_https_check check (short_url is null or short_url like 'https://%')
);

create index if not exists idx_campaign_links_org on campaign_links(organization_id) where deleted_at is null;
create index if not exists idx_campaign_links_workspace on campaign_links(workspace_id) where deleted_at is null;
create index if not exists idx_campaign_links_campaign on campaign_links(campaign_id) where deleted_at is null;

-- The redirect route resolves display_id with no org context, so it must be globally unique.
create unique index if not exists uq_campaign_links_display_id on campaign_links(display_id);

create sequence if not exists campaign_link_display_seq start 1;
