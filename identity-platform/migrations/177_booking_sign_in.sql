-- Signing in to a booking page's customer account by phone: a code goes to the number on
-- WhatsApp, and typing it back proves whose number it is.

-- The account's number in WhatsApp's form (digits, country code first), and when it was proved.
-- A proved account shows every booking made for that number, on any device.
alter table booking_accounts add column if not exists phone_key varchar(20);
alter table booking_accounts add column if not exists verified_at timestamptz;
create index if not exists idx_booking_accounts_phone_key
  on booking_accounts(organization_id, phone_key);

-- The codes sent. Only a hash is kept; a code lasts a few minutes and a few wrong tries.
create table if not exists booking_sign_in_codes (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  phone_key varchar(20) not null,
  code_hash varchar(64) not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_booking_sign_in_codes_phone
  on booking_sign_in_codes(organization_id, phone_key);
