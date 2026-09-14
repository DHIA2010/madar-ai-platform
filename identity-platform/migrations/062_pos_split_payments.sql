-- A sale can now be settled across more than one payment method (e.g. part cash, part card),
-- and part of it can be deferred to a named customer's account ("آجل") instead of collected at
-- the register. pos_invoices.payment_method_code stays as the single-method code when only one
-- method was used, or the literal 'split' when more than one was -- existing filters/breakdowns
-- that key off it keep working; the real per-method detail lives in pos_invoice_payments.

alter table pos_invoices add column if not exists customer_id uuid references customers(id);
create index if not exists idx_pos_invoices_customer on pos_invoices(customer_id)
  where customer_id is not null;

create table if not exists pos_invoice_payments (
  id uuid primary key,
  invoice_id uuid not null references pos_invoices(id) on delete cascade,
  payment_method_code text not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_pos_invoice_payments_invoice on pos_invoice_payments(invoice_id);

-- Running amount this customer owes the store from deferred ("آجل") sales -- increases when an
-- invoice defers part of its total to the customer's account. There is no settlement flow yet
-- (see native-customers-service.ts), so today this only ever grows; paying it down is real,
-- planned follow-up work, not something this column pretends to already support.
alter table customers add column if not exists balance_due numeric(12, 2) not null default 0;
