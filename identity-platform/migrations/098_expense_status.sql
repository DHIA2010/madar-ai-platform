-- An expense can be cancelled (e.g. entered by mistake, or voided after the fact) without being
-- deleted outright -- it stays visible/auditable in the list, but is excluded from every financial
-- total (net income's expense total, the VAT return's input-tax figure) the same way a cancelled
-- pos_invoice already is. Same enum-with-default convention as pos_invoices.status.
alter table expenses add column if not exists status varchar(16) not null default 'active'
  check (status in ('active', 'cancelled'));
