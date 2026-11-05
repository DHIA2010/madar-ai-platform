-- Tax invoices issued automatically for payments made in the app (by card, or a bank transfer
-- staff approved), alongside the payment receipt they belong to. source is 'sales' for the
-- sales team's own invoices, 'auto' for these.
alter table crm_invoices add column if not exists source varchar(16) not null default 'sales';
alter table crm_invoices add column if not exists receipt_id uuid;
create unique index if not exists idx_crm_invoices_receipt on crm_invoices(receipt_id);
