-- How an organization sends WhatsApp messages to its customers (whatsapp/merchant-connection.ts):
-- "web" -- Madar opens the customer's chat in the merchant's own WhatsApp Web / app with a ready
-- message, and the merchant presses send (no setup); or "business" -- Madar sends them itself from
-- the merchant's own business number, connected through Meta's Embedded Signup.
create table if not exists whatsapp_merchant_connections (
  organization_id uuid primary key references organizations(id) on delete cascade,
  send_mode text not null default 'web' check (send_mode in ('web', 'business')),
  status text not null default 'none' check (status in ('none', 'connected', 'disconnected')),
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  -- The business token Embedded Signup issued for the merchant's account, and the two-step pin
  -- Madar registered the number with -- both encrypted like the platform's own token.
  business_token_encrypted text,
  registration_pin_encrypted text,
  -- What still needs attention after connecting (e.g. the number couldn't be registered yet).
  last_error text,
  connected_at timestamptz,
  connected_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
