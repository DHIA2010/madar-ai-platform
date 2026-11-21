-- The Booking app: paying online when booking. Each business uses its own Moyasar account, so
-- the money goes from its customer straight to it and Madar never holds any of it.

-- off: nothing is asked for online. deposit: a share of the price. full: the whole price.
alter table booking_settings add column if not exists payment_mode varchar(8) not null default 'off';
alter table booking_settings add column if not exists deposit_percent integer not null default 30;
-- The business's own Moyasar keys. The publishable one is meant for the page a customer sees
-- and the secret one is kept encrypted, used only by the server to check and refund a payment.
alter table booking_settings add column if not exists moyasar_publishable_key text;
alter table booking_settings add column if not exists moyasar_secret_encrypted text;

-- What a booking has to be paid online before it stands, what has been paid that way and what
-- of it was given back. An online booking waiting for its payment holds its time until
-- payment_expires_at and is let go after it.
alter table bookings add column if not exists payment_due numeric(12, 2) not null default 0;
alter table bookings add column if not exists paid_online numeric(12, 2) not null default 0;
alter table bookings add column if not exists refunded_online numeric(12, 2) not null default 0;
alter table bookings add column if not exists moyasar_payment_id text;
alter table bookings add column if not exists payment_expires_at timestamptz;
create index if not exists idx_bookings_moyasar_payment on bookings(moyasar_payment_id);
