-- A business number connected through Meta's coexistence: it stays in use in the WhatsApp Business
-- app on the merchant's phone while Madar sends from it through the Cloud API. Such a number is
-- never registered again (it already is), and its contacts and history are synced at connection.
alter table whatsapp_merchant_connections add column if not exists coexistence boolean not null default false;
