-- A gauge-display KPI tracks progress toward a fixed goal, distinct from period-over-period
-- comparison (compare_enabled/compare_against, which compares against actuals, not a goal).
-- Null = no goal set; the gauge falls back to a simple current-value display in that case.
alter table kpis add column if not exists target numeric;
