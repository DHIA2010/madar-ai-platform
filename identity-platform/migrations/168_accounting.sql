-- The Accounting app (its own subscription, accountingEnabled): double-entry books that fill
-- themselves in from what the organization already records in Madar (POS sales and returns, tax
-- invoices and their payments, online orders, purchases, supplier and customer vouchers, expenses,
-- stock counts), plus manual journal entries for everything that happens outside Madar.
--
-- Nothing here is written by the checkout or invoicing code paths: a separate posting pass
-- (accounting/sync.ts) reads the source documents and keeps one journal entry per document in
-- step with it. See accounting/postings.ts for what each document posts.

-- One row per organization: where its books stand.
create table if not exists accounting_books (
  organization_id uuid primary key references organizations(id) on delete cascade,
  -- Entries dated on or before this day are closed: nobody edits them, and the posting pass
  -- leaves them exactly as they were when the period was closed.
  locked_through date,
  -- Manual entries are numbered JE-000001, JE-000002... per organization.
  last_entry_number bigint not null default 0,
  -- The posting pass: when the last one started and finished, and where the high-volume sources
  -- (POS sales, POS returns, online orders) were read up to.
  sync_started_at timestamptz,
  last_synced_at timestamptz,
  sync_cursor timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The chart of accounts. `system_key` marks the accounts the posting pass needs (cash, sales, VAT
-- output...): they can be renamed and renumbered but not deleted. Everything else is the
-- organization's own.
create table if not exists accounting_accounts (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  code varchar(20) not null,
  name_ar text not null,
  name_en text not null,
  type varchar(12) not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  -- Where the account sits inside its type on the statements (current_asset, cost_of_sales...).
  section varchar(24) not null,
  system_key varchar(80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_accounting_accounts_code
  on accounting_accounts(organization_id, code);
create unique index if not exists uq_accounting_accounts_system_key
  on accounting_accounts(organization_id, system_key);

-- A journal entry. `source_type` is 'manual' or 'opening' for entries a person wrote, otherwise
-- the kind of document it was posted from, with `source_id` that document's id: one entry per
-- document, replaced in place when the document changes and removed when it is cancelled.
create table if not exists accounting_entries (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete set null,
  entry_date date not null,
  -- JE-000001 for manual entries; the document's own number (INV-000123...) for posted ones.
  reference varchar(80) not null,
  description text not null default '',
  source_type varchar(32) not null,
  source_id varchar(80),
  -- What the entry was built from, so an unchanged document is recognised without rewriting it.
  source_hash varchar(64),
  -- Figures fixed when the entry was first posted and kept on later passes (the cost of the
  -- goods sold, taken from the products' cost at that moment).
  meta jsonb not null default '{}',
  total_amount numeric(16, 2) not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_accounting_entries_source
  on accounting_entries(organization_id, source_type, source_id);
create index if not exists idx_accounting_entries_org_date
  on accounting_entries(organization_id, entry_date);

-- The entry's lines: each debits or credits one account. `party_type`/`party_id` say whose
-- balance a receivable or payable line belongs to (a customer or a supplier).
create table if not exists accounting_entry_lines (
  id uuid primary key,
  entry_id uuid not null references accounting_entries(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  account_id uuid not null references accounting_accounts(id),
  entry_date date not null,
  workspace_id uuid,
  line_order integer not null default 0,
  debit numeric(16, 2) not null default 0,
  credit numeric(16, 2) not null default 0,
  memo text not null default '',
  party_type varchar(12),
  party_id uuid
);

create index if not exists idx_accounting_lines_entry on accounting_entry_lines(entry_id);
create index if not exists idx_accounting_lines_account
  on accounting_entry_lines(organization_id, account_id, entry_date);
create index if not exists idx_accounting_lines_party
  on accounting_entry_lines(organization_id, party_type, party_id);
