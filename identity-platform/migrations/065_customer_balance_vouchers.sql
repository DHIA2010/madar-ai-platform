-- Receipt vouchers ("سند قبض") and payment/disbursement vouchers ("سند صرف") against a customer's
-- deferred balance (customers.balance_due, 062_pos_split_payments.sql) -- distinct from the
-- prepaid wallet ledger in customer_wallet_transactions (063_customer_wallet.sql). A receipt
-- records real money collected that pays down what the customer owes; a payment records the
-- business manually advancing money/credit to the customer, increasing what they owe (the same
-- direction as an "آجل" deferred sale, just not tied to a POS invoice).

create sequence if not exists customer_receipt_voucher_number_seq;
create sequence if not exists customer_payment_voucher_number_seq;

create table if not exists customer_balance_vouchers (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  customer_id uuid not null references customers(id) on delete cascade,
  type text not null check (type in ('receipt', 'payment')),
  reference text not null unique,
  amount numeric(12, 2) not null check (amount > 0),
  tax_inclusive boolean not null default false,
  tax_amount numeric(12, 2) not null default 0,
  payment_method_code text not null,
  notes text,
  attachment_urls text[] not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_balance_vouchers_customer
  on customer_balance_vouchers(customer_id);
