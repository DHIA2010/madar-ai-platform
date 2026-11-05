-- A discount coupon the customer applied on the invoice's pay page. Its discount is part of
-- discount_halalas (with the sales team's own discount), kept apart here so it can be removed.
alter table crm_invoices add column if not exists coupon_id uuid;
alter table crm_invoices add column if not exists coupon_code varchar(40);
alter table crm_invoices add column if not exists coupon_discount_halalas integer not null default 0;
