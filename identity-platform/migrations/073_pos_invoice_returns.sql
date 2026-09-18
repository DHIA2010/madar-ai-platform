-- Partial returns: pos_invoice_items.returned_quantity tracks how much of that ONE line has
-- already come back, cumulative across however many separate return events touch this invoice
-- (a cashier can return 1 of 3 units today and the other 2 next week; each event validates
-- against what is actually still left, not just the line's original quantity).
--
-- line_net_amount is the line's net (tax-excluded) amount for its FULL original quantity, BEFORE
-- any discount -- a value invoices-service.ts's create() already computes in memory
-- (lineComputations[i].lineNet) but previously only used to compute totals, never persisted. A
-- return needs it to correctly prorate that specific line's own discount onto whatever fraction
-- of it is actually being returned; net_amount/tax_amount (already stored) are AFTER discount, so
-- they alone cannot tell a return how much of the original price was discount versus tax.
alter table pos_invoice_items add column if not exists returned_quantity numeric(12,3) not null default 0;
alter table pos_invoice_items add column if not exists line_net_amount numeric(12,2) not null default 0;

-- 'partially_returned' sits between 'completed' and 'returned' -- some, but not all, of the
-- invoice's own quantity has come back. Existing rows keep whatever status they already have.
--
-- The original constraint (migration 055) was an unnamed inline column check, so Postgres itself
-- auto-named it "pos_invoices_status_check" (the standard tablename_column_check convention) --
-- but the test harness's in-memory engine (pg-mem) does not follow that convention for an inline
-- check and instead auto-names it positionally ("pos_invoices_constraint_1"), so both names are
-- dropped here; each DROP is a harmless no-op wherever that particular name does not exist.
alter table pos_invoices drop constraint if exists pos_invoices_status_check;
alter table pos_invoices drop constraint if exists pos_invoices_constraint_1;
alter table pos_invoices add constraint pos_invoices_status_check
  check (status = any (array['completed', 'cancelled', 'returned', 'partially_returned']));

-- One row per real return EVENT -- a cashier processing an actual return, for whatever items and
-- quantities were actually handed back that one time. This is the invoice's own credit note
-- (إشعار دائن): a real, independently-numbered document, not just a status flip on the original
-- invoice, since one invoice can legitimately be returned more than once over its lifetime.
create table if not exists pos_invoice_returns (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  invoice_id uuid not null references pos_invoices(id) on delete cascade,
  return_number text not null,
  subtotal_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Snapshotted fresh at return time (loadSellerSnapshot(), same as pos_invoices.seller_* does at
  -- sale time) rather than copied from the original invoice -- an org's tax profile can change
  -- between the sale and a later return, and this credit note is its own real ZATCA document.
  seller_name text,
  seller_vat_number text,
  seller_address text,
  qr_code text,
  unique (workspace_id, return_number)
);
create index if not exists idx_pos_invoice_returns_invoice on pos_invoice_returns(invoice_id);
create index if not exists idx_pos_invoice_returns_org_created
  on pos_invoice_returns(organization_id, created_at desc);

create table if not exists pos_invoice_return_items (
  id uuid primary key,
  return_id uuid not null references pos_invoice_returns(id) on delete cascade,
  invoice_item_id uuid not null references pos_invoice_items(id) on delete cascade,
  product_id text,
  product_name text not null,
  unit_price numeric(12,2) not null,
  quantity numeric(12,3) not null,
  net_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0
);
create index if not exists idx_pos_invoice_return_items_return on pos_invoice_return_items(return_id);

-- Sequential per-workspace numbering for return_number, the exact same row-locked-UPSERT pattern
-- pos_invoice_number_counters (migration 067) already uses for invoice_number -- a rollback
-- inside the same transaction reverts the counter too, so a failed return can never burn a
-- number and leave a gap in the branch's own credit-note sequence.
create table if not exists pos_return_number_counters (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  next_number integer not null default 1
);
