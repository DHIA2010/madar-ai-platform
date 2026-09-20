-- A return's refund can now be split across more than one payment method (e.g. half back in
-- cash, half as store credit) -- one real row per method/amount here, same shape as
-- pos_invoice_payments already has for a sale's own (possibly split) payment. Replaces
-- refund_payment_method_code (074_pos_invoice_return_refund_method.sql) as the source of truth
-- for what a return actually refunded through; that column is kept and still populated (the
-- single method's own code, or the "split" sentinel once more than one row exists here) purely
-- for any code that still reads it directly, exactly how pos_invoices.payment_method_code already
-- coexists with pos_invoice_payments.
create table if not exists pos_invoice_return_payments (
  id uuid primary key,
  return_id uuid not null references pos_invoice_returns(id) on delete cascade,
  payment_method_code text not null,
  amount numeric(12,2) not null
);
create index if not exists idx_pos_invoice_return_payments_return
  on pos_invoice_return_payments(return_id);

-- Backfill one row per already-existing return from its own single refund_payment_method_code --
-- every return created before this migration was necessarily a single-method refund. Reuses the
-- return's own id as this one backfilled payment row's id (a plain primary key here, nothing else
-- references it, and each return gets exactly one such row) rather than gen_random_uuid(), and a
-- LEFT JOIN + NULL check rather than a correlated NOT EXISTS: this codebase's own pg-mem test
-- harness (see migration-runner.ts -- every migration replays on every boot, there is no
-- migration-tracking table) implements neither.
insert into pos_invoice_return_payments (id, return_id, payment_method_code, amount)
select r.id, r.id, r.refund_payment_method_code, r.total_amount
  from pos_invoice_returns r
  left join pos_invoice_return_payments p on p.return_id = r.id
 where r.refund_payment_method_code is not null
   and p.return_id is null;
