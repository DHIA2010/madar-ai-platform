-- The Booking app (its own subscription, bookingEnabled): appointments for any business that
-- works by time -- salons, spas, clinics, studios, workshops. A business lists its services and
-- the people who provide them (with their weekly hours and time off), takes bookings from its
-- staff or from its own public booking page, and follows each booking to its end.

-- One row per organization: its public booking page and the rules every booking follows.
create table if not exists booking_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  -- The page's address: /b/<slug>. Empty until the business chooses one.
  slug varchar(60),
  online_enabled boolean not null default false,
  display_name text,
  description text,
  phone text,
  address text,
  -- Minutes between the start times offered on a day.
  slot_interval_minutes integer not null default 30,
  -- How soon before its start a time can still be booked online, and how far ahead.
  lead_time_minutes integer not null default 60,
  advance_days integer not null default 30,
  -- Whether an online booking is confirmed at once or waits for the staff.
  auto_confirm boolean not null default true,
  cancellation_allowed boolean not null default true,
  cancellation_deadline_minutes integer not null default 120,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_booking_settings_slug on booking_settings(slug);

-- What can be booked.
create table if not exists booking_services (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  category text,
  duration_minutes integer not null,
  price numeric(12, 2) not null default 0,
  -- Minutes kept free after each booking of this service.
  buffer_minutes integer not null default 0,
  -- People one provider serves in the same slot: 1 for an appointment, more for a group session.
  capacity integer not null default 1,
  color varchar(9),
  -- published: on the public page. internal: bookable by staff only.
  visibility varchar(12) not null default 'published',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_booking_services_org on booking_services(organization_id);

-- Who provides the services. A provider is a bookable person, not a login -- it may be tied to
-- one of the organization's users, and belongs to a branch when the business has several.
create table if not exists booking_providers (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid,
  user_id uuid,
  name text not null,
  title text,
  phone text,
  color varchar(9),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_booking_providers_org on booking_providers(organization_id);

create table if not exists booking_provider_services (
  provider_id uuid not null references booking_providers(id) on delete cascade,
  service_id uuid not null references booking_services(id) on delete cascade,
  organization_id uuid not null,
  primary key (provider_id, service_id)
);

-- A provider's weekly hours: any number of periods a day, in minutes from midnight, Riyadh time.
-- weekday 0 is Sunday.
create table if not exists booking_working_hours (
  id uuid primary key,
  organization_id uuid not null,
  provider_id uuid not null references booking_providers(id) on delete cascade,
  weekday smallint not null,
  start_minute integer not null,
  end_minute integer not null
);
create index if not exists idx_booking_hours_provider on booking_working_hours(provider_id);

-- Time that cannot be booked: a holiday, a leave, a break. No provider means everyone.
create table if not exists booking_time_off (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  provider_id uuid references booking_providers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind varchar(16) not null default 'other',
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_booking_time_off_org on booking_time_off(organization_id, starts_at);

-- A booking. The customer's name and phone are kept as written at the time, next to the link to
-- the customers list. public_token opens the customer's own page for it.
create table if not exists bookings (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid,
  number integer not null,
  service_id uuid not null references booking_services(id),
  provider_id uuid not null references booking_providers(id),
  customer_id uuid,
  customer_name text not null,
  customer_phone text,
  party_size integer not null default 1,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price numeric(12, 2) not null default 0,
  -- pending, confirmed, completed, cancelled, no_show
  status varchar(12) not null default 'confirmed',
  payment_status varchar(8) not null default 'unpaid',
  payment_method text,
  -- staff: entered in Madar. online: taken on the public page.
  source varchar(8) not null default 'staff',
  notes text,
  customer_notes text,
  cancel_reason text,
  cancelled_by varchar(8),
  public_token varchar(64) not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bookings_org_start on bookings(organization_id, starts_at);
create index if not exists idx_bookings_provider_start on bookings(provider_id, starts_at);
create unique index if not exists uq_bookings_public_token on bookings(public_token);
