-- The Booking app, second part: what a service can be made of (options, add-ons, bundles), what
-- lowers or pays a booking's price (coupons, gift cards, packages and memberships, loyalty
-- points), what the business learns afterwards (commissions, reviews), and what goes out on its
-- own (WhatsApp messages, a calendar feed, an invoice).

-- A service's choices. options: the same service in several sizes, each with its own length and
-- price. addons: extras taken with it, each adding to the price and maybe to the length.
-- bundle_service_ids: the services a bundle is made of, when the service is one.
alter table booking_services add column if not exists options jsonb not null default '[]'::jsonb;
alter table booking_services add column if not exists addons jsonb not null default '[]'::jsonb;
alter table booking_services
  add column if not exists bundle_service_ids jsonb not null default '[]'::jsonb;

-- The share of a completed booking a provider earns, in percent.
alter table booking_providers
  add column if not exists commission_rate numeric(5, 2) not null default 0;

-- How a booking's price was reached. subtotal is the price before anything is taken off, and
-- price (already there) stays what the customer owes after the discount, points and gift card.
alter table bookings add column if not exists option_id text;
alter table bookings add column if not exists option_name text;
alter table bookings add column if not exists addons jsonb not null default '[]'::jsonb;
alter table bookings add column if not exists subtotal numeric(12, 2);
alter table bookings add column if not exists discount numeric(12, 2) not null default 0;
alter table bookings add column if not exists coupon_id uuid;
alter table bookings add column if not exists coupon_code text;
alter table bookings add column if not exists gift_card_id uuid;
alter table bookings add column if not exists gift_amount numeric(12, 2) not null default 0;
alter table bookings add column if not exists customer_plan_id uuid;
alter table bookings add column if not exists loyalty_points integer not null default 0;
alter table bookings add column if not exists loyalty_discount numeric(12, 2) not null default 0;
alter table bookings add column if not exists loyalty_earned integer not null default 0;
alter table bookings add column if not exists commission_amount numeric(12, 2) not null default 0;
-- What was sent to the customer about it, and the invoice issued for it.
alter table bookings add column if not exists confirmation_sent_at timestamptz;
alter table bookings add column if not exists reminder_sent_at timestamptz;
alter table bookings add column if not exists invoice_id uuid;
alter table bookings add column if not exists invoice_number text;

alter table booking_settings add column if not exists loyalty_enabled boolean not null default false;
alter table booking_settings
  add column if not exists loyalty_points_per_sar numeric(8, 2) not null default 1;
-- What one point is worth when spent, in the business's currency.
alter table booking_settings
  add column if not exists loyalty_point_value numeric(8, 4) not null default 0.05;
alter table booking_settings add column if not exists reviews_enabled boolean not null default true;
alter table booking_settings
  add column if not exists whatsapp_confirmation boolean not null default false;
alter table booking_settings add column if not exists whatsapp_reminder boolean not null default false;
alter table booking_settings
  add column if not exists reminder_hours_before integer not null default 24;
alter table booking_settings add column if not exists invoice_on_completion boolean not null default false;
-- Opens the business's calendar feed (bookings as calendar events) to a calendar program.
alter table booking_settings add column if not exists calendar_token varchar(64);

-- A code that takes something off a booking's price.
create table if not exists booking_coupons (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  code varchar(40) not null,
  -- percent: value is a percentage. fixed: value is an amount.
  kind varchar(8) not null default 'percent',
  value numeric(12, 2) not null,
  max_discount numeric(12, 2),
  min_amount numeric(12, 2) not null default 0,
  starts_on date,
  ends_on date,
  usage_limit integer,
  per_customer_limit integer,
  used_count integer not null default 0,
  -- Empty means every service.
  service_ids jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_booking_coupons_code on booking_coupons(organization_id, code);

-- A prepaid amount under a code, spent on bookings until it runs out.
create table if not exists booking_gift_cards (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  code varchar(40) not null,
  initial_amount numeric(12, 2) not null,
  balance numeric(12, 2) not null,
  purchaser_name text,
  recipient_name text,
  recipient_phone text,
  message text,
  expires_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_booking_gift_cards_code
  on booking_gift_cards(organization_id, code);

-- What a customer can buy ahead: a package (a number of visits) or a membership (visits without
-- a count, for a length of time). uses empty means unlimited.
create table if not exists booking_plans (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  kind varchar(12) not null default 'package',
  name text not null,
  description text,
  price numeric(12, 2) not null default 0,
  uses integer,
  validity_days integer not null default 30,
  -- Empty means every service.
  service_ids jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_booking_plans_org on booking_plans(organization_id);

-- A plan a customer holds.
create table if not exists booking_customer_plans (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_id uuid not null references booking_plans(id),
  customer_id uuid,
  customer_name text not null,
  customer_phone text,
  uses_total integer,
  uses_left integer,
  starts_on date not null,
  expires_on date not null,
  status varchar(10) not null default 'active',
  price_paid numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_booking_customer_plans_org
  on booking_customer_plans(organization_id, customer_phone);

-- Points earned and spent, one line each; a customer's balance is their sum.
create table if not exists booking_loyalty_ledger (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null,
  booking_id uuid,
  points integer not null,
  reason varchar(12) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_booking_loyalty_customer
  on booking_loyalty_ledger(organization_id, customer_id);

-- What a customer said after a visit: one review per booking.
create table if not exists booking_reviews (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  provider_id uuid,
  service_id uuid,
  customer_name text not null,
  rating smallint not null,
  comment text,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_booking_reviews_booking on booking_reviews(booking_id);
create index if not exists idx_booking_reviews_org on booking_reviews(organization_id, created_at);
