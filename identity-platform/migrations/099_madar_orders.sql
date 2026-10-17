-- A Madar-created order ("طلب يدوي") -- entered directly in Madar's own UI, not synced from any
-- connected storefront. Surfaced through the same /v1/orders list as Salla/Shopify/Zid orders
-- (orders/service.ts's OrdersAggregationService), tagged platform = 'Madar'. Pushed to the
-- merchant's connected Salla store via Salla's External Orders API as a secondary, retriable
-- side-effect of creation (see salla_push_status below) -- a push failure must never roll back
-- the local order; Madar is the source of truth regardless of Salla's reachability.
create table if not exists madar_orders (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid not null references workspaces(id),
  -- Human-facing, per-workspace sequential display number ("MO-000123") -- see
  -- madar_order_number_counters. Distinct from id, which salla_external_order_id derives from.
  order_number text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'cancelled', 'refunded')),
  payment_status text not null default 'pending'
    check (payment_status in ('paid', 'pending', 'refunded')),
  -- The actual method chosen in the Madar UI (e.g. 'cash', 'card', 'cod', 'bank_transfer') --
  -- richer than Salla's own cod|external_epayment binary. SallaOrderPushService maps this down
  -- to Salla's enum at push time; this column always keeps what Madar itself actually recorded.
  payment_method_code text not null,
  currency text not null default 'SAR',
  customer_name text not null,
  customer_phone text,
  customer_email text,
  -- Optional link to the native customer catalog -- same optional-snapshot relationship
  -- pos_invoices.customer_id already has to customers(id).
  customer_id uuid references customers(id),
  is_guest_customer boolean not null default true,
  -- Salla's receiver object is all-required fields on their side; captured here as its own
  -- group rather than reusing customer_name/phone, since a receiver can legitimately differ
  -- from the buyer (gift orders, etc.) even though the Create Order form defaults one from the
  -- other.
  receiver_name text not null,
  receiver_phone text not null,
  receiver_country_code text not null default 'SA',
  receiver_email text,
  receiver_notify boolean not null default true,
  delivery_method text check (delivery_method in ('shipping', 'pickup')),
  ship_to_country text,
  ship_to_city text,
  ship_to_district text,
  ship_to_address text,
  ship_to_postal_code text,
  courier_id text,
  shipping_cost numeric(12, 2) not null default 0,
  discount_code text,
  discount_amount numeric(12, 2) not null default 0,
  shipping_discount_amount numeric(12, 2) not null default 0,
  subtotal_amount numeric(12, 2) not null,
  tax_amount numeric(12, 2) not null,
  total_amount numeric(12, 2) not null,
  notes text,
  created_by_user_id uuid not null references users(id),
  -- Which Salla connection the push used (or would use) -- nullable: an org with no connected
  -- Salla store at creation time still gets a real local order, just with no push target.
  salla_connection_id uuid references salla_oauth_connections(id),
  -- 'not_applicable': no connected Salla store existed at creation time, never attempted.
  -- 'pending': a connected store existed; push has not yet succeeded (first attempt still
  --   running, or failed and awaiting retry -- see salla_push_error_* below for "why").
  -- 'pushed': Salla accepted the order (201); salla_order_id/salla_reference_id are set.
  -- 'failed': the most recent attempt errored; salla_push_error_code/message explain why.
  salla_push_status text not null default 'not_applicable'
    check (salla_push_status in ('not_applicable', 'pending', 'pushed', 'failed')),
  -- Deterministic: 'MADAR-' || id, computed once at insert, never regenerated. Deriving it from
  -- this row's own immutable uuid (rather than a counter) means a retried push after an
  -- ambiguous network failure is automatically idempotent from Salla's side: Salla's own 422
  -- duplicate-external_order_id response on a retry IS the signal "this already landed", which
  -- the retry path treats as a success reconciliation rather than a hard failure.
  salla_external_order_id text not null,
  salla_order_id text,
  salla_reference_id text,
  salla_push_attempted_at timestamptz,
  salla_push_error_code text,
  salla_push_error_message text,
  salla_push_attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_madar_orders_workspace_order_number
  on madar_orders(workspace_id, order_number);
create unique index if not exists uq_madar_orders_external_order_id
  on madar_orders(salla_external_order_id);
create index if not exists idx_madar_orders_org on madar_orders(organization_id);
create index if not exists idx_madar_orders_workspace on madar_orders(workspace_id);
create index if not exists idx_madar_orders_created_at on madar_orders(created_at);
-- Backs a future retry-sweep worker (not built in this phase) and today's manual-retry list.
create index if not exists idx_madar_orders_push_status on madar_orders(salla_push_status)
  where salla_push_status = 'failed';

create table if not exists madar_order_items (
  id uuid primary key,
  order_id uuid not null references madar_orders(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  sku text,
  unit_price numeric(12, 2) not null,
  quantity numeric(12, 3) not null default 1,
  tax_rate numeric(6, 4) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null,
  cost_price numeric(12, 2),
  weight numeric(10, 3)
);

create index if not exists idx_madar_order_items_order on madar_order_items(order_id);

-- Per-workspace counter for order_number, incremented via a row-locked UPSERT inside the same
-- transaction as the order insert -- the lesson migration 067_pos_invoice_zatca.sql already
-- learned the hard way for pos_invoices (a global sequence burns numbers on rollback); applying
-- it from day one here instead of retrofitting it later.
create table if not exists madar_order_number_counters (
  workspace_id uuid primary key references workspaces(id),
  next_number bigint not null default 1
);
