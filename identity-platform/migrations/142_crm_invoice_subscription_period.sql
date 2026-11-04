-- The subscription period a sales invoice covers, printed on it. Empty = worked out from the
-- packages on it (paid or issue date + the longest package period); set by hand (manual = true)
-- or recorded when its apps were switched on.
alter table crm_invoices add column if not exists subscription_start date;
alter table crm_invoices add column if not exists subscription_end date;
alter table crm_invoices add column if not exists subscription_dates_manual boolean not null default false;
