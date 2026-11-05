-- Which ZATCA environment a device was onboarded for (sandbox, simulation or production): its
-- CSR names it, and every ZATCA call for the device must go to that environment's endpoint.
-- Older devices have none stored and fall back to what their CSR says.
alter table zatca_devices add column if not exists environment varchar(16);
