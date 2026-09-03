-- Extends the campaign-attribution-only tracking_events table (migration 034) into a general
-- normalized event stream for the Madar Tracking Snippet + SDK: e-commerce events, generic
-- properties, page/device/geo context, and client-generated idempotency keys. Existing flat
-- UTM/click-id/country_code columns are left untouched -- the attribution service already reads
-- them -- new context is added as jsonb rather than an ever-widening flat table.

alter table tracking_events drop constraint if exists tracking_events_event_type_check;
alter table tracking_events add constraint tracking_events_event_type_check
  check (event_type in (
    'CLICK', 'PAGE_VIEW', 'PRODUCT_VIEW', 'PRODUCT_LIST_VIEW', 'SEARCH',
    'ADD_TO_CART', 'REMOVE_FROM_CART', 'CART_VIEW',
    'CHECKOUT_STARTED', 'CHECKOUT_COMPLETED', 'PURCHASE',
    'IDENTIFY', 'HEARTBEAT'
  ));

alter table tracking_events add column if not exists event_id text;
alter table tracking_events add column if not exists properties jsonb;
alter table tracking_events add column if not exists page jsonb;
alter table tracking_events add column if not exists device jsonb;
alter table tracking_events add column if not exists geo jsonb;
alter table tracking_events add column if not exists customer_ref text;
-- Raw platform-provided customer identifier from Madar.identify(customerId) -- distinct from
-- customer_ref (a SHA-256 email hash used only for order-attribution matching). Not itself
-- treated as PII here since it's an opaque foreign identifier, same as how orders/customers
-- tables elsewhere in this codebase already store raw Salla/Zid/Shopify customer IDs.
alter table tracking_events add column if not exists customer_id text;

-- Client-generated, so a retried POST (network blip, sendBeacon duplicate) never double-inserts.
-- Partial: not every caller of recordClick (e.g. the /m/:displayId redirect's CLICK event) sets one.
create unique index if not exists uq_tracking_events_org_event_id
  on tracking_events(organization_id, event_id) where event_id is not null;

-- Per-org remote-config overrides (sdk_version, heartbeat/session/live-visitor timeouts,
-- tracking/attribution feature flags, referrer classification rules). Null means "use code
-- defaults" -- most orgs will never need an override.
alter table organizations add column if not exists tracking_config jsonb;

-- Live-visitor presence: one row per (organization_id, visitor_id), upserted on every capture
-- (including heartbeats, which otherwise write nothing to tracking_events). Staleness is a
-- query-time filter (last_seen_at > now() - interval) -- no cleanup job needed.
create table if not exists tracking_live_visitors (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  visitor_id text not null,
  session_id text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  current_page_url text,
  current_page_title text,
  product_id text,
  product_name text,
  country text,
  city text,
  device_type varchar(16),
  browser text,
  traffic_source text,
  campaign text,
  current_activity varchar(32),
  constraint uq_tracking_live_visitors_org_visitor unique (organization_id, visitor_id)
);

create index if not exists idx_tracking_live_visitors_org_last_seen
  on tracking_live_visitors(organization_id, last_seen_at desc);
