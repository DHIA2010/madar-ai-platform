-- ZATCA's reason for refusing a document, in Arabic as well (zatca_last_error stays English) --
-- see pos/zatca-reporting.ts.
alter table pos_invoices add column if not exists zatca_last_error_ar text;
alter table pos_invoice_returns add column if not exists zatca_last_error_ar text;
