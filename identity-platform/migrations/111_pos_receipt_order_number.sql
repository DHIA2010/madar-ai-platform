-- Two independently-toggleable receipt features (Settings -> Cashier -> Receipt content):
--  1. A per-line FORMATTED title/description banner printed above the seller name -- the exact
--     same NoteLine[] shape (text/bold/align/fontSize/color) pos_saved_notes.lines already uses
--     for sale notes, edited with the same FormattedNoteEditor.tsx and rendered with the same
--     NoteLines.tsx, so this is one real implementation of "formatted lines", not a second one.
--     Read LIVE from pos_settings at render/print time (like the org logo), never snapshotted
--     onto an invoice, since it's branding/messaging, not a fiscal fact frozen at issuance time.
--  2. A per-sale "order number" distinct from invoice_number, generated via its own per-workspace
--     counter (mirrors pos_invoice_number_counters' transaction-safety: incremented with a single
--     atomic UPSERT run inside the same transaction as the invoice insert, so a rolled-back sale
--     never burns a number). Unlike the title/description, this IS a sequential identifier
--     assigned once at sale time, so it's snapshotted onto pos_invoices.order_number exactly like
--     notes_lines -- a reprint must keep showing the number that was actually handed out that day,
--     even if settings change later.
alter table pos_settings
  drop column if exists receipt_title,
  drop column if exists receipt_description;
alter table pos_settings
  add column if not exists show_receipt_title boolean not null default false,
  add column if not exists receipt_title_lines jsonb,
  add column if not exists receipt_description_lines jsonb,
  add column if not exists show_order_number boolean not null default false,
  add column if not exists order_number_reset_mode varchar(10) not null default 'daily',
  add column if not exists order_number_max_value integer;

alter table pos_settings
  drop constraint if exists pos_settings_order_number_reset_mode_check;
alter table pos_settings
  add constraint pos_settings_order_number_reset_mode_check
    check (order_number_reset_mode in ('daily', 'max_value'));

alter table pos_invoices add column if not exists order_number integer;

-- One counter row per workspace, same scoping as pos_invoice_number_counters (067). next_number
-- is the next value to hand out; last_reset_date drives the 'daily' reset mode (see
-- invoices-service.ts's create(), which runs a single UPSERT with a CASE expression against this
-- table -- no separate SELECT ... FOR UPDATE needed, same one-statement safety the invoice-number
-- counter already relies on).
create table if not exists pos_order_number_counters (
  workspace_id uuid primary key references workspaces(id),
  next_number integer not null default 1,
  last_reset_date date not null default current_date
);
