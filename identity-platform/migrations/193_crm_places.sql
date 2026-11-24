-- The sales team's free directory of Saudi businesses (crm/places.ts): the Saudi rows of the
-- Overture Maps "places" open data (licences CDLA-Permissive-2.0 / Apache-2.0, which allow
-- keeping it), sent here once a month by a GitHub workflow. Searched from Madar Admin -> CRM ->
-- "البحث عن عملاء" by activity, name, city or around a point; chosen rows become leads.
create table if not exists crm_places (
  id text primary key,
  release varchar(24) not null,
  name text not null,
  category text,
  phone text,
  mobile varchar(16),
  has_phone boolean not null default false,
  website text,
  email text,
  social text,
  address text,
  locality text,
  latitude double precision not null,
  longitude double precision not null,
  confidence real not null default 0,
  closed boolean not null default false
);
create index if not exists idx_crm_places_category on crm_places(category);
create index if not exists idx_crm_places_latitude on crm_places(latitude);
create index if not exists idx_crm_places_release on crm_places(release);

-- One row: which release of the data is loaded, and whether the team asked for a fresh load.
create table if not exists crm_places_state (
  id integer primary key,
  release varchar(24),
  loaded_at timestamptz,
  places integer not null default 0,
  refresh_requested_at timestamptz
);
