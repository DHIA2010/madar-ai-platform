-- A device that already signed invoices can't be deleted (they reference it, and ZATCA requires
-- them kept) -- removing it stops it instead: it signs no new sales, but stays for its invoices
-- and any reports still pending. See zatca-devices-service.ts's removeDevice().
alter table zatca_devices add column if not exists deactivated_at timestamptz;
