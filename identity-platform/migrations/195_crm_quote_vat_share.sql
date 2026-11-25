-- How VAT applies to a sales quote or invoice: 'added' (15% on top of the prices, the original
-- behaviour), 'included' (the prices already hold the 15%, broken out of them) or 'none' (no VAT).
alter table crm_quotes add column if not exists vat_mode varchar(16) not null default 'added';
alter table crm_invoices add column if not exists vat_mode varchar(16) not null default 'added';

-- The secret in the link a quote is sent with (WhatsApp), so the customer can open it.
alter table crm_quotes add column if not exists share_token varchar(64);
create unique index if not exists idx_crm_quotes_share_token on crm_quotes(share_token);
