-- Campaign Link / Attribution: high-volume event layer.
-- Deliberately minimal (no raw IP, no free-text user-agent storage) so this table
-- can move to a dedicated event store (ClickHouse/BigQuery/etc.) later without
-- redesigning the attribution model that reads it.

create table if not exists tracking_events (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  campaign_link_id uuid references campaign_links(id),
  event_type varchar(16) not null,
  visitor_id text not null,
  session_id text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_url text,
  referrer_url text,
  device_type varchar(16),
  country_code varchar(2),
  occurred_at timestamptz not null default now(),
  constraint tracking_events_event_type_check check (event_type in ('CLICK', 'PAGE_VIEW'))
);

create index if not exists idx_tracking_events_org_time on tracking_events(organization_id, occurred_at desc);
create index if not exists idx_tracking_events_campaign_link on tracking_events(campaign_link_id, occurred_at desc);
create index if not exists idx_tracking_events_session on tracking_events(session_id);

-- The resolved touchpoint layer: what attribution matching actually reads.
-- Kept separate from tracking_events so future attribution models can be
-- recomputed from this smaller, already-resolved table.
create table if not exists attributions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  campaign_id uuid references campaigns(id),
  campaign_link_id uuid references campaign_links(id),
  visitor_id text not null,
  session_id text not null,
  customer_ref text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_attributions_org_time on attributions(organization_id, occurred_at desc);
create index if not exists idx_attributions_session on attributions(session_id, occurred_at desc);
create index if not exists idx_attributions_customer_ref on attributions(customer_ref, occurred_at desc) where customer_ref is not null;
create index if not exists idx_attributions_campaign_link on attributions(campaign_link_id, occurred_at desc);
create index if not exists idx_attributions_utm on attributions(organization_id, utm_source, utm_medium, utm_campaign, occurred_at desc);
