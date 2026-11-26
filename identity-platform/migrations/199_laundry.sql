-- The Laundry app (المغاسل): a free add-on a business switches on in the marketplace. Orders are
-- received, worked on and collected later, and each is invoiced (POS invoice, ZATCA) when it is
-- paid in full -- at drop-off or at pickup. A deposit goes onto the customer's account and pays
-- the invoice later.

create table if not exists laundry_settings (
  organization_id uuid primary key,
  -- Prices in the list include VAT (the usual way a laundry shows them).
  prices_include_tax boolean not null default true,
  -- Hours from drop-off to the promised ready time, and for an urgent order.
  turnaround_hours integer not null default 48,
  urgent_turnaround_hours integer not null default 24,
  -- Urgent orders cost this much more, as a percentage of the order.
  urgent_surcharge_percent numeric(6,2) not null default 50,
  delivery_fee numeric(12,2) not null default 0,
  -- An order ready this many days and not collected counts as unclaimed.
  unclaimed_days integer not null default 7,
  -- Send the "ready" WhatsApp message on its own when an order is marked ready.
  auto_ready_message boolean not null default true,
  updated_at timestamptz not null default now()
);
-- Set once the starting items and services were added, so two screens opened together never add
-- them twice.
alter table laundry_settings add column if not exists catalog_seeded boolean not null default false;

-- What is washed (a thobe, a shirt, a blanket) and what is done to it (wash and iron, iron only).
create table if not exists laundry_items (
  id uuid primary key,
  organization_id uuid not null,
  name varchar(80) not null,
  category varchar(40),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_laundry_items_org on laundry_items(organization_id);

create table if not exists laundry_services (
  id uuid primary key,
  organization_id uuid not null,
  name varchar(80) not null,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_laundry_services_org on laundry_services(organization_id);

-- The price of one item with one service.
create table if not exists laundry_prices (
  organization_id uuid not null,
  item_id uuid not null,
  service_id uuid not null,
  price numeric(12,2) not null,
  primary key (organization_id, item_id, service_id)
);

create table if not exists laundry_orders (
  id uuid primary key,
  organization_id uuid not null,
  workspace_id uuid,
  order_number varchar(20) not null,
  customer_id uuid,
  customer_name varchar(160),
  customer_phone varchar(32),
  -- received | processing | ready | delivered | cancelled
  status varchar(16) not null default 'received',
  urgent boolean not null default false,
  pieces integer not null default 0,
  -- What the order costs, VAT included: items, the urgent charge, delivery.
  items_total numeric(12,2) not null default 0,
  urgent_fee numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  -- Paid ahead as a deposit (on the customer's account) and the invoice once issued.
  deposit_amount numeric(12,2) not null default 0,
  invoice_id uuid,
  invoice_number varchar(30),
  -- pickup (the customer collects) | delivery
  fulfilment varchar(16) not null default 'pickup',
  pickup_address text,
  delivery_address text,
  -- When the business collects the clothes from the customer, and when it brings them back.
  pickup_at timestamptz,
  delivery_at timestamptz,
  driver_user_id uuid,
  subscription_id uuid,
  notes text,
  promised_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  ready_notified_at timestamptz,
  reminded_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_laundry_orders_org_status on laundry_orders(organization_id, status);
create index if not exists idx_laundry_orders_org_created on laundry_orders(organization_id, created_at);
create unique index if not exists idx_laundry_orders_number on laundry_orders(organization_id, order_number);

create table if not exists laundry_order_lines (
  id uuid primary key,
  order_id uuid not null,
  item_id uuid,
  service_id uuid,
  item_name varchar(80) not null,
  service_name varchar(80) not null,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  -- Pieces covered by the customer's laundry subscription cost nothing here.
  covered_quantity integer not null default 0,
  line_total numeric(12,2) not null,
  note text,
  position integer not null default 0
);
create index if not exists idx_laundry_order_lines_order on laundry_order_lines(order_id);

-- Stains, damage, a missing button: written down (and photographed) at drop-off.
create table if not exists laundry_order_photos (
  id uuid primary key,
  order_id uuid not null,
  url text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_laundry_order_photos_order on laundry_order_photos(order_id);

-- Everything that happened to an order, in order: status changes, payments, messages.
create table if not exists laundry_order_events (
  id uuid primary key,
  order_id uuid not null,
  kind varchar(24) not null,
  detail jsonb not null default '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_laundry_order_events_order on laundry_order_events(order_id);

-- A monthly pieces plan (30 pieces for 150 SAR) and a customer's copy of it.
create table if not exists laundry_plans (
  id uuid primary key,
  organization_id uuid not null,
  name varchar(80) not null,
  pieces integer not null,
  price numeric(12,2) not null,
  valid_days integer not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists laundry_subscriptions (
  id uuid primary key,
  organization_id uuid not null,
  customer_id uuid not null,
  plan_id uuid,
  plan_name varchar(80) not null,
  pieces_total integer not null,
  pieces_used integer not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  invoice_id uuid,
  invoice_number varchar(30),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_laundry_subscriptions_customer on laundry_subscriptions(organization_id, customer_id);

create table if not exists laundry_order_counters (
  organization_id uuid primary key,
  next_number integer not null default 1
);
