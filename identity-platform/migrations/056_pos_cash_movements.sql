-- A manual cash-drawer adjustment mid-shift -- a manager pulling change out, or topping the float
-- up -- distinct from a sale or a return, which pos_invoices already covers. Real and shift-
-- scoped, so a shift's close summary can show "سحب من الصندوق"/"إيداع في الصندوق" as actual
-- recorded amounts instead of an always-zero line that only looks tracked.
create table if not exists pos_cash_movements (
  id uuid primary key,
  shift_id uuid not null references pos_shifts(id) on delete cascade,
  type text not null check (type in ('withdrawal', 'deposit')),
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_cash_movements_shift on pos_cash_movements(shift_id);
