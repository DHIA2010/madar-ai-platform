-- The individual pieces of hardware attached to a branch's tills: a named scale on COM3, the
-- cashier's receipt printer, the barcode reader, the cash drawer.
--
-- Distinct from pos_device_settings (migration 048), which holds one configuration per device
-- *type* -- the baud rate every scale in the branch uses, the paper width every printer uses.
-- This table is the inventory: which units exist, what model they are, and where they are
-- plugged in.
--
-- last_seen_at is the only source of connection state. It is null until something actually
-- reports in, so a device that has never been heard from reads as disconnected rather than
-- being assumed healthy -- nothing in the platform pings this hardware today, and inventing a
-- "connected" flag would make the screen claim something it cannot know.
create table if not exists pos_devices (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  name text not null,
  device_type varchar(24) not null,
  model text,
  connection varchar(16) not null,
  -- COM3, USB, or an address -- the shape depends on the connection, so it stays free text.
  port text,
  enabled boolean not null default true,
  last_seen_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint pos_devices_type_check check (
    device_type in (
      'scale',
      'receipt_printer',
      'barcode_scanner',
      'cash_drawer',
      'customer_display',
      'card_reader'
    )
  ),
  constraint pos_devices_connection_check check (
    connection in ('usb', 'network', 'bluetooth', 'serial')
  )
);

create index if not exists idx_pos_devices_org on pos_devices(organization_id)
  where deleted_at is null;

create index if not exists idx_pos_devices_org_type on pos_devices(organization_id, device_type)
  where deleted_at is null;
