-- A real prepaid customer wallet, distinct from customers.balance_due (062_pos_split_payments.sql,
-- money the customer OWES): wallet_balance is money the customer has ALREADY given the store in
-- advance, which a sale can spend down via the "customer_wallet" payment method
-- (invoices-service.ts). customer_wallet_transactions is the real audit trail behind both
-- directions (a cashier-recorded top-up, or a purchase spending it down).

alter table customers add column if not exists wallet_balance numeric(12, 2) not null default 0;

create table if not exists customer_wallet_transactions (
  id uuid primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  type text not null check (type in ('top_up', 'purchase')),
  amount numeric(12, 2) not null check (amount > 0),
  -- Set only for a 'purchase' row -- a 'top_up' has no invoice behind it.
  invoice_id uuid references pos_invoices(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_wallet_transactions_customer
  on customer_wallet_transactions(customer_id);
