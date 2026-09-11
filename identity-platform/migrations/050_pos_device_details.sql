-- The add-device screen configures a single unit end to end: what it is, where it is plugged
-- in, and how that particular device behaves. Migration 049 stored only the identity.
--
-- settings is per device rather than per type because two scales in one branch genuinely differ
-- -- the deli counter's reads three decimals in kilos, the bulk scale reads one -- and the
-- type-level defaults in pos_device_settings cannot express that. The type-level row stays as
-- the starting point a new device is created from.
alter table pos_devices
  add column if not exists description text,
  add column if not exists baud_rate integer,
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table pos_devices drop constraint if exists pos_devices_baud_rate_check;
alter table pos_devices add constraint pos_devices_baud_rate_check
  check (baud_rate is null or baud_rate between 300 and 921600);
