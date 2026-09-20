-- The linked customer's own VAT number, snapshotted at sale time -- same "frozen at issuance,
-- not a live join" reasoning as seller_name/seller_vat_number/seller_address already have (see
-- migration 067_pos_invoice_zatca.sql): a later edit to the customer's own tax profile must never
-- rewrite what an already-issued invoice says about the buyer. Only ever set when the sale was
-- linked to a real native customer (customers.customer_id) who had a VAT number on file (see
-- migration 075_customer_business_info.sql) at the moment of sale.
alter table pos_invoices add column if not exists customer_vat_number text;
