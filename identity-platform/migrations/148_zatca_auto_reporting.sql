-- Signed sales and returns are now reported to ZATCA automatically right after they are saved,
-- with a background retry for whatever could not be reported then (see pos/zatca-reporting.ts).
-- These columns record each attempt so a failed document can be retried and its reason shown.
alter table pos_invoices add column if not exists zatca_attempts integer not null default 0;
alter table pos_invoices add column if not exists zatca_last_error text;
alter table pos_invoices add column if not exists zatca_last_attempt_at timestamptz;

-- A return is a credit note (type 381) on the same device chain as the sales it corrects, so it
-- carries the same signing and reporting fields pos_invoices does.
alter table pos_invoice_returns add column if not exists zatca_device_id uuid references zatca_devices(id);
alter table pos_invoice_returns add column if not exists icv bigint;
alter table pos_invoice_returns add column if not exists previous_invoice_hash text;
alter table pos_invoice_returns add column if not exists invoice_hash text;
alter table pos_invoice_returns add column if not exists cryptographic_stamp text;
alter table pos_invoice_returns add column if not exists zatca_signed_xml text;
alter table pos_invoice_returns add column if not exists zatca_uuid uuid;
alter table pos_invoice_returns add column if not exists zatca_status text;
alter table pos_invoice_returns add column if not exists zatca_response jsonb;
alter table pos_invoice_returns add column if not exists zatca_reported_at timestamptz;
alter table pos_invoice_returns add column if not exists zatca_attempts integer not null default 0;
alter table pos_invoice_returns add column if not exists zatca_last_error text;
alter table pos_invoice_returns add column if not exists zatca_last_attempt_at timestamptz;
