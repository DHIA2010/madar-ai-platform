-- Point-of-sale hardware configuration: the receipt printer, barcode scanner, cash drawer,
-- customer display and card reader a branch sells through.
--
-- One row per workspace rather than per terminal: the hardware in a branch is the same for every
-- till standing in it, and a per-terminal override is a later refinement that would only add
-- rows here, not change this shape. workspace_id is nullable so an organization with a single
-- location can configure once without creating one.
--
-- The settings themselves are jsonb rather than columns. Peripherals arrive in groups -- adding
-- a scale or a label printer means one more key, not one more migration -- and nothing here is
-- ever queried across rows; it is read whole, by exactly one workspace, to configure a till.
create table if not exists pos_device_settings (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_device_settings_org on pos_device_settings(organization_id);

-- One configuration per workspace, and one organization-wide default. Two partial indexes
-- rather than a single unique on (organization_id, workspace_id): in SQL two nulls are never
-- equal, so that one constraint would let unlimited organization-wide rows through.
create unique index if not exists uq_pos_device_settings_workspace
  on pos_device_settings(organization_id, workspace_id)
  where workspace_id is not null;

create unique index if not exists uq_pos_device_settings_org_default
  on pos_device_settings(organization_id)
  where workspace_id is null;
