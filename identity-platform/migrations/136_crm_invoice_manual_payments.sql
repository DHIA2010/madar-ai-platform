-- Invoices marked paid by hand can also be paid in cash or another way, on the date it happened.
alter table crm_invoices drop constraint if exists crm_invoices_payment_method_check;
alter table crm_invoices add constraint crm_invoices_payment_method_check
  check (payment_method is null or payment_method in ('card', 'bank_transfer', 'cash', 'other'));
