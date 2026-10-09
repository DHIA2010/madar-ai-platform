-- A return's status was a manually-set, editable workflow state (pending/approved/refunded/
-- rejected). That's replaced with a fixed, server-computed fact about the return itself: does it
-- return everything that was purchased ('full') or only some of it ('partial')? Never settable by
-- the client and never changed after creation (see ReturnsRepository.create()'s own computation).
--
-- 094's check constraint on this column was inline and unnamed, so a real Postgres database names
-- it by its own default convention ("purchase_returns_status_check"), while pg-mem (this repo's
-- test harness) assigns inline checks a different internal name ("purchase_returns_constraint_1",
-- confirmed empirically -- pg-mem also doesn't release a column's constraint on DROP COLUMN, so
-- that approach doesn't work either). Both names are dropped here, each a no-op if absent, so this
-- migration behaves the same against both.
alter table purchase_returns drop constraint if exists purchase_returns_status_check;
alter table purchase_returns drop constraint if exists purchase_returns_constraint_1;

-- The old workflow states don't map to full/partial at all, and this table predates this
-- migration by only days with at most a handful of rows in any environment, so there is nothing
-- worth preserving to backfill from -- every existing row becomes the new column's default.
update purchase_returns set status = 'partial' where status not in ('full', 'partial');

alter table purchase_returns alter column status set default 'partial';
alter table purchase_returns add constraint purchase_returns_status_check
  check (status in ('full', 'partial'));
