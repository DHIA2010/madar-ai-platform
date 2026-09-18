-- B2B identity + Saudi National Address fields for a native (Madar) customer -- lets an invoice
-- issued to a VAT-registered business customer carry the BUYER's own VAT number/address, the
-- same way pos_invoices already snapshots the SELLER's own (see migration 067_pos_invoice_zatca.
-- sql). Nullable/optional across the board -- a walk-in customer never needs any of this, and a
-- synced storefront customer (Salla/Shopify/Zid) has no real row here to carry it on at all, same
-- "Madar-only" scope as customers.region/account_balance already have.
alter table customers add column if not exists is_business_customer boolean not null default false;
alter table customers add column if not exists vat_number text;
alter table customers add column if not exists commercial_registration text;
alter table customers add column if not exists building_number text;
alter table customers add column if not exists secondary_number text;
alter table customers add column if not exists street text;
alter table customers add column if not exists city text;
alter table customers add column if not exists district text;
alter table customers add column if not exists postal_code text;
alter table customers add column if not exists country_code text not null default 'SA';
