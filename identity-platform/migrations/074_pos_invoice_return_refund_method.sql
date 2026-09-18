-- Which method a return's refund was actually given back through (cash handed over, card
-- reversed, credited to the customer's own account, etc.). Purely informational for cash/card/
-- transfer/bnpl kinds, but for a 'credit' or 'prepaid' kind it is what createReturn() now uses to
-- decide whether to credit the customer's real account_balance at all -- choosing cash/card means
-- the refund was already handled outside the system (money physically handed back at the till),
-- so also crediting account balance would double-refund the same return.
alter table pos_invoice_returns add column if not exists refund_payment_method_code text;
