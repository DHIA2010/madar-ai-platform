-- A supplier's own invoice can be uploaded to a purchase order and read into its lines. The file is
-- kept on the purchase, and each supplier's product codes are remembered once a user confirms what
-- they are, so that supplier's next invoice matches on its own.
alter table purchases add column if not exists invoice_attachment_url text;

create table if not exists supplier_product_codes (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  -- As printed on the supplier's invoice; code_key is its trimmed, lower-cased form.
  code text not null,
  code_key text not null,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_supplier_product_codes
  on supplier_product_codes(organization_id, supplier_id, code_key);
