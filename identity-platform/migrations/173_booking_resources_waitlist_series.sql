-- The Booking app, third part: the rooms and equipment a service needs, a waiting list for days
-- that are full, and bookings that repeat.

-- A room, a chair, a machine: something a service cannot be given without, of which the
-- business has a certain number. A booking holds one of each thing its service needs.
create table if not exists booking_resources (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  -- room or equipment
  kind varchar(12) not null default 'room',
  quantity integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_booking_resources_org on booking_resources(organization_id);

create table if not exists booking_service_resources (
  service_id uuid not null references booking_services(id) on delete cascade,
  resource_id uuid not null references booking_resources(id) on delete cascade,
  organization_id uuid not null,
  primary key (service_id, resource_id)
);

-- Someone waiting for a time on a day that was full: who, for which service, on which day.
create table if not exists booking_waitlist (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  service_id uuid not null references booking_services(id) on delete cascade,
  provider_id uuid,
  customer_name text not null,
  customer_phone text,
  preferred_date date not null,
  note text,
  -- waiting, booked, removed
  status varchar(8) not null default 'waiting',
  -- staff or online
  source varchar(8) not null default 'staff',
  created_at timestamptz not null default now()
);
create index if not exists idx_booking_waitlist_org on booking_waitlist(organization_id, status);

-- Bookings made together as one repeating series share this.
alter table bookings add column if not exists series_id uuid;
create index if not exists idx_bookings_series on bookings(series_id);
