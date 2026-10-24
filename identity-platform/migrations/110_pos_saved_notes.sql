-- A small library of reusable, formatted POS sale notes -- same "named library, one markable
-- default" shape as tax_rates (068_tax_rates.sql), reused deliberately rather than inventing a
-- new pattern. Unlike tax rates, there is no lazy-seeded fallback row here: having zero saved
-- notes is a perfectly normal state (a sale simply starts with an empty note), so
-- PosSavedNotesService never needs to auto-create one.
create table if not exists pos_saved_notes (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  -- Management-list-only label (e.g. "Standard thank-you") -- never printed itself.
  title text not null,
  -- Array of { text: string, bold: boolean, align: 'left' | 'center' | 'right' } -- the actual
  -- printed content, one entry per line. Validated server-side by noteLineSchema
  -- (src/identity-platform/schemas.ts), not re-validated at the database layer.
  lines jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pos_saved_notes_org on pos_saved_notes(organization_id);

-- Enforced at the database level, not just in application code, so a race between two concurrent
-- "make this the default" requests can never leave two rows both marked default for the same
-- organization -- same reasoning as uq_tax_rates_one_default_per_org.
create unique index if not exists uq_pos_saved_notes_default_per_org
  on pos_saved_notes(organization_id) where is_default;

-- A snapshot of whichever note (saved-and-picked, saved-and-edited, or typed fresh) was actually
-- on the sale at checkout time -- deliberately NOT a foreign key to pos_saved_notes, so editing or
-- deleting a saved note later can never change what an already-printed receipt showed. The
-- existing plain `notes` column is kept as a flattened, newline-joined plain-text mirror of these
-- same lines (written together, see invoices-service.ts's create()), so anything that only ever
-- reads `notes` as a string keeps working unchanged.
alter table pos_invoices add column if not exists notes_lines jsonb;

-- Same snapshot shape on a parked cart, so resuming a held order restores the formatted note too
-- (see PosHeldOrdersService.hold()/mapRow()) -- also not a foreign key, for the same reason.
alter table pos_held_orders add column if not exists notes_lines jsonb;
