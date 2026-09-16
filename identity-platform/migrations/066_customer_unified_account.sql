-- Unifies customers.wallet_balance (money the customer gave the store in advance,
-- 063_customer_wallet.sql) and customers.balance_due (money the customer owes the store,
-- 062_pos_split_payments.sql) into ONE signed running balance: positive means the store owes
-- the customer (prepaid credit); negative means the customer owes the store (deferred debt).
-- Kept as two separate numbers, a "wallet top-up" and a "سند قبض" receipt were the same real
-- event under two different names, and a credit sale vs. a wallet-funded sale had to be read
-- from two different columns to know a customer's real position. One column, one ledger.
--
-- account_balance starts NULL (not defaulted to 0) so the backfill below only ever touches a
-- row that has never been migrated -- this file replays on every server boot (no migration
-- tracking table in this codebase), so a backfill keyed off a real default value would
-- silently overwrite live balances on every restart. A brand-new customer created after this
-- migration gets account_balance = 0 directly from NativeCustomersService.create(), never
-- NULL, so it is never touched by the WHERE clause below again.
alter table customers add column if not exists account_balance numeric(12, 2);
update customers
   set account_balance = coalesce(wallet_balance, 0) - coalesce(balance_due, 0)
 where account_balance is null;
alter table customers alter column account_balance set not null;
alter table customers alter column account_balance set default 0;

-- The two legacy columns and their dedicated ledgers become fully unused the moment
-- native-customers-service.ts and invoices-service.ts are updated to read/write
-- account_balance and customer_account_transactions instead -- dropped rather than left as
-- dead weight. This is pre-production data (the local/demo dataset only), so there is no real
-- customer history worth preserving across the two old, differently-shaped tables.
alter table customers drop column if exists wallet_balance;
alter table customers drop column if exists balance_due;
drop table if exists customer_wallet_transactions;
drop table if exists customer_balance_vouchers;

-- A "سند قبض" (receipt) or manual wallet top-up credits the account; a "سند صرف" (payment
-- voucher) debits it; a credit- or wallet-funded portion of a sale debits it; returning an
-- invoice always credits the full invoice total back, regardless of how it was originally
-- paid (a refund becomes real store credit rather than cash handed back). amount is always a
-- positive magnitude -- direction is derived from type when replaying the ledger, exactly like
-- the two tables this replaces did.
create sequence if not exists customer_return_number_seq;

create table if not exists customer_account_transactions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  customer_id uuid not null references customers(id) on delete cascade,
  type text not null check (type in ('receipt', 'payment', 'sale', 'return')),
  reference text not null unique,
  amount numeric(12, 2) not null check (amount > 0),
  -- Only ever set for a 'sale' or 'return' row -- a manual receipt/payment voucher has no
  -- invoice behind it.
  invoice_id uuid references pos_invoices(id),
  -- Only ever set for a 'receipt' or 'payment' row -- a sale/return's payment method(s) already
  -- live on pos_invoice_payments, and a return can span several original methods.
  payment_method_code text,
  tax_inclusive boolean not null default false,
  tax_amount numeric(12, 2) not null default 0,
  notes text,
  attachment_urls text[] not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_account_transactions_customer
  on customer_account_transactions(customer_id);
