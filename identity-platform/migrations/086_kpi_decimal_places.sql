-- How many decimal places a KPI's numbers/percentages should round to when displayed. Default 1
-- matches the rounding every KPI used before this setting existed (Intl maximumFractionDigits: 1),
-- so existing KPIs render unchanged unless someone explicitly picks a different precision.
alter table kpis add column if not exists decimal_places smallint not null default 1;
