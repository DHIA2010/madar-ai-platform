-- Sector plugins (الإضافات): helpers that complete the cashier for one kind of business -- a
-- laundry today, device repair and others later. They come with the POS app at no charge, and
-- the business switches each on or off whenever it likes (its data stays while it is off).
create table if not exists organization_plugins (
  organization_id uuid not null,
  plugin varchar(40) not null,
  enabled boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (organization_id, plugin)
);
