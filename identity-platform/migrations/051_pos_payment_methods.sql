-- Which ways a branch takes money, and what each one costs it.
--
-- Only overrides are stored. The built-in methods (cash, mada, card, the wallets, the two
-- buy-now-pay-later providers) are a fixed catalogue in code, and a row appears here the first
-- time a branch changes one -- so a new organization needs no seeding, and adding a method to the
-- catalogue later reaches every branch without a backfill.
--
-- A branch can also add its own method, which is the one case where a row carries its own
-- name -- for a catalogue method those columns stay null and the code supplies the wording.
create table if not exists pos_payment_methods (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  code varchar(40) not null,
  name text,
  subtitle text,
  enabled boolean not null default true,
  -- What the provider charges per transaction. numeric, not float: a fee is money arithmetic.
  fee_percent numeric(6, 3) not null default 0,
  is_custom boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint pos_payment_methods_fee_check check (fee_percent >= 0 and fee_percent <= 100),
  -- Written without trim(): pg-mem, which the whole test suite runs on, implements very few
  -- native functions. The service trims before it writes, so a whitespace-only name never
  -- reaches the column in the first place.
  constraint pos_payment_methods_custom_name_check check (
    is_custom = false or (name is not null and name <> '')
  )
);

create index if not exists idx_pos_payment_methods_org on pos_payment_methods(organization_id)
  where deleted_at is null;

-- One override per method per workspace, and one per method organization-wide. Split in two
-- because two nulls are never equal in SQL, so a single unique would not bound the null case.
create unique index if not exists uq_pos_payment_methods_workspace
  on pos_payment_methods(organization_id, workspace_id, code)
  where workspace_id is not null and deleted_at is null;

create unique index if not exists uq_pos_payment_methods_org_default
  on pos_payment_methods(organization_id, code)
  where workspace_id is null and deleted_at is null;
