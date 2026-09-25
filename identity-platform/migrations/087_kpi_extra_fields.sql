-- Lets a KPI compute more than one metric alongside its primary field/aggregation, e.g. a table
-- or line chart showing both "إجمالي المبيعات" and "عدد الفواتير" in one widget. Each entry is
-- {field, aggregation}, validated against the same catalog as the primary field
-- (query-builder.ts). Only table/line display types render these; other display types ignore
-- them. Empty array = single-metric KPI, the only mode that existed before this column.
alter table kpis add column if not exists extra_fields jsonb not null default '[]'::jsonb;
