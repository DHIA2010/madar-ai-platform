-- The Booking app's public page as a storefront, and the customer's own side of it.

-- How the page looks: a cover picture, the business's own logo for this page, a line under its
-- name, its colour, where to find it, and pictures of the place.
alter table booking_settings add column if not exists cover_url text;
alter table booking_settings add column if not exists logo_url text;
alter table booking_settings add column if not exists tagline text;
alter table booking_settings add column if not exists accent_color varchar(7);
alter table booking_settings add column if not exists instagram_url text;
alter table booking_settings add column if not exists map_url text;
alter table booking_settings add column if not exists gallery jsonb not null default '[]'::jsonb;

-- A picture of the service, shown on its card.
alter table booking_services add column if not exists image_url text;

-- A customer's account on one business's page. It belongs to the phone it was made on: the
-- token is kept by that browser, and whatever is booked from it is listed under it. Nothing is
-- shown for a phone number that was merely typed.
create table if not exists booking_accounts (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  token varchar(64) not null,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists idx_booking_accounts_token on booking_accounts(token);
create index if not exists idx_booking_accounts_org on booking_accounts(organization_id);

alter table bookings add column if not exists account_id uuid;
create index if not exists idx_bookings_account on bookings(account_id);
alter table booking_waitlist add column if not exists account_id uuid;
create index if not exists idx_booking_waitlist_account on booking_waitlist(account_id);

-- What the customer is told in their account: a booking confirmed, moved or cancelled by the
-- business, a place found for them from the waiting list.
create table if not exists booking_account_notices (
  id uuid primary key,
  account_id uuid not null references booking_accounts(id) on delete cascade,
  kind varchar(24) not null,
  booking_id uuid,
  params jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_booking_account_notices_account
  on booking_account_notices(account_id);
