-- A cashier exchange (استبدال): items brought back for others. Saved as a credit note for what
-- came back and a new invoice for what went out, paid by an "exchange credit" worth the returned
-- items, so only the difference changes hands. This row ties the two together and keeps what
-- the owner's exchange report reads.
create table if not exists pos_exchanges (
  id uuid primary key,
  organization_id uuid not null,
  workspace_id uuid not null,
  original_invoice_id uuid not null,
  return_id uuid not null,
  new_invoice_id uuid not null,
  -- What came back, what went out, and new minus returned (above 0: the customer paid it,
  -- below 0: the customer got it back).
  returned_amount numeric(12,2) not null,
  new_amount numeric(12,2) not null,
  difference_amount numeric(12,2) not null,
  -- even | collected | refunded | balance (added to the customer's balance)
  settlement varchar(16) not null,
  refund_payment_method_code varchar(64),
  -- size | color | defect | other
  reason varchar(16) not null,
  notes text,
  idempotency_key uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_pos_exchanges_org_created on pos_exchanges(organization_id, created_at);
create unique index if not exists idx_pos_exchanges_idempotency
  on pos_exchanges(organization_id, idempotency_key);

alter table pos_invoices add column if not exists exchange_id uuid;
alter table pos_invoice_returns add column if not exists exchange_id uuid;
-- Why the items came back (size, color, defect...), for returns and exchanges alike.
alter table pos_invoice_returns add column if not exists reason varchar(16);
-- False for an item that came back damaged: not put back into stock.
alter table pos_invoice_return_items add column if not exists restocked boolean not null default true;
