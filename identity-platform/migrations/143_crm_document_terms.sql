-- Terms and conditions printed on quotes and invoices: the defaults live in platform settings,
-- these hold a document's own wording when it was changed for that one (null = the default).
alter table crm_quotes add column if not exists terms text;
alter table crm_invoices add column if not exists terms text;
