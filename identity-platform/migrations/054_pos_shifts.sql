-- A cashier's session at a branch: opened with a counted starting cash float, closed with a
-- counted ending float. Real and working on its own -- unlike the sales/expected-cash figures a
-- shift screen usually also shows, which need an actual till recording transactions (nothing does
-- yet; the cashier screen is still a placeholder), so those are deliberately not modeled here and
-- will be added once that exists.
create table if not exists pos_shifts (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid not null references workspaces(id),
  cashier_user_id uuid not null references users(id),
  status text not null default 'open' check (status in ('open', 'closed')),
  opening_cash_amount numeric(12, 2) not null,
  opening_notes text,
  opened_at timestamptz not null default now(),
  opened_by uuid references users(id),
  closing_cash_amount numeric(12, 2),
  closing_notes text,
  closed_at timestamptz,
  closed_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_shifts_org on pos_shifts(organization_id);
create index if not exists idx_pos_shifts_workspace on pos_shifts(workspace_id);

-- A person cannot be working two shifts at once, anywhere -- enforced as a partial unique index
-- (only one row per cashier can ever have status = 'open') rather than only in application code,
-- so a race between two requests can't both succeed.
create unique index if not exists uq_pos_shifts_open_cashier
  on pos_shifts(cashier_user_id)
  where status = 'open';
