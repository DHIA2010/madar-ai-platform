-- How the cashier hands over the receipt after a sale (Settings -> الكاشير): print it, send it to
-- the customer on WhatsApp as a PDF, or both. Default is printing -- what every store did so far.
alter table pos_settings add column if not exists receipt_delivery text not null default 'print';
alter table pos_settings drop constraint if exists pos_settings_receipt_delivery_check;
alter table pos_settings add constraint pos_settings_receipt_delivery_check
  check (receipt_delivery in ('print', 'whatsapp', 'both'));
