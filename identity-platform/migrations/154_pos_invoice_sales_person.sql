-- The salesperson a sale is credited to (picked in the cashier) -- distinct from cashier_user_id,
-- who rang it up. The name is kept as it was at sale time, like the seller snapshot, so the
-- receipt and reports show it even if the member is later renamed or removed.
alter table pos_invoices add column if not exists sales_person_user_id uuid references users(id);
alter table pos_invoices add column if not exists sales_person_name text;
create index if not exists idx_pos_invoices_sales_person on pos_invoices(organization_id, sales_person_user_id);
