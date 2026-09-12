-- A human-facing sequential number ("#21") for the shift detail page, the same pattern
-- pos_invoices already uses for invoice numbers. Nullable: shifts opened before this migration
-- have no number to backfill honestly (there is no real "when was it truly first" ordering that
-- would not just be invented), so they show as unnumbered rather than assigned a number that
-- implies an ordering that was never actually recorded.
alter table pos_shifts add column if not exists shift_number bigint;

create sequence if not exists pos_shift_number_seq;
