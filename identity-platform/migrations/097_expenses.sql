-- Expenses module: org-scoped expense categories + expense records, tied to a branch
-- (workspace), never to a supplier/vendor. Default categories are deliberately NOT seeded here
-- (this migration replays on every backend boot, see migration-runner.ts -- a one-off INSERT
-- belongs in the service layer's lazy-seed instead, see
-- ExpenseCategoriesRepository.ensureDefaultCategories()).

create table if not exists expense_categories (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_expense_categories_org_name
  on expense_categories(organization_id, lower(name));

create table if not exists expenses (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid not null references workspaces(id),
  category_id uuid not null references expense_categories(id),
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method varchar(16) not null check (payment_method in ('cash','bank_transfer','card','cheque')),
  -- Whether `amount` already includes VAT ("شامل الضريبة") or excludes it ("غير شامل الضريبة") --
  -- a dropdown choice on the form, not a computed tax amount.
  tax_inclusive boolean not null default false,
  expense_date date not null,
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_expenses_org on expenses(organization_id) where deleted_at is null;
create index if not exists idx_expenses_category on expenses(category_id);
create index if not exists idx_expenses_workspace on expenses(workspace_id);
