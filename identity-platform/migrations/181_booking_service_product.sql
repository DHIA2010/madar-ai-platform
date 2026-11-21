-- A booking service that is also a product of the business (a "service" product sold from the
-- cashier): the two are one thing. The service is made from the product, its name and price
-- follow each other afterwards, and a visit's invoice line carries the product so sales reports
-- count it together with what the cashier sold.
alter table booking_services add column if not exists product_id uuid;
create index if not exists idx_booking_services_product
  on booking_services(organization_id, product_id);
