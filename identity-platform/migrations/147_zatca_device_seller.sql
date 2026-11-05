-- The seller details a device's certificate was issued for: every invoice it signs (the
-- compliance samples included) must carry this VAT number and registered name.
alter table zatca_devices add column if not exists vat_number varchar(15);
alter table zatca_devices add column if not exists organization_name varchar(200);
