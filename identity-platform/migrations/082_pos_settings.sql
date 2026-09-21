-- One row of real, persisted POS/cashier behavior settings per branch (organization + optional
-- workspace, same scoping pos_devices already uses -- a null workspace_id means "applies to the
-- whole organization until a specific branch overrides it"). Every default below matches the
-- platform's actual current unconditional behavior exactly (allow_below_cost_sale = true,
-- allow_out_of_stock_sale = true per migration 079, confirm_sale = false, auto_print_invoice =
-- true, allow_split_payment = true, show_product_images = true, show_category_panel = true,
-- enable_barcode_scanner = true) -- so an organization that never visits this settings page sees
-- zero behavior change, and every toggle here is something a user actively turns OFF from an
-- already-working default, never something silently turned on.
create table if not exists pos_settings (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),

  -- Sale settings
  allow_below_cost_sale boolean not null default true,
  allow_out_of_stock_sale boolean not null default true,
  confirm_sale boolean not null default false,
  auto_open_cash_drawer boolean not null default false,
  allow_manual_price_edit boolean not null default true,
  apply_discounts boolean not null default true,

  -- Print settings
  default_printer_device_id uuid references pos_devices(id),
  paper_width varchar(8) not null default '80mm',
  auto_print_invoice boolean not null default true,
  print_kitchen_copy boolean not null default false,
  copies_count integer not null default 1,

  -- Payment settings
  show_quick_payment_screen boolean not null default false,
  allow_split_payment boolean not null default true,
  remember_last_payment_method boolean not null default false,
  require_payment_method_selection boolean not null default true,

  -- Interface settings
  show_product_images boolean not null default true,
  use_compact_mode boolean not null default false,
  show_category_panel boolean not null default true,

  -- Scanner settings
  enable_barcode_scanner boolean not null default true,
  play_scan_sound boolean not null default false,

  created_by_user_id uuid not null references users(id),
  updated_by_user_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pos_settings_paper_width_check check (paper_width in ('58mm', '80mm')),
  constraint pos_settings_copies_count_check check (copies_count between 1 and 5)
);

create unique index if not exists uq_pos_settings_org_workspace
  on pos_settings(organization_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'));

create index if not exists idx_pos_settings_org on pos_settings(organization_id);
