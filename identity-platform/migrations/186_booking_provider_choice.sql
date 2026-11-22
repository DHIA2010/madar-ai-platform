-- Choosing who provides a service on the booking page: each provider can have a picture, shown
-- with their job title; and a booking whose customer chose "anyone available" remembers that, so
-- the customer is told the provider is decided on arrival while the calendar still holds a real
-- one (which is what keeps two bookings out of the same time).
alter table booking_providers add column if not exists image_url text;
alter table bookings add column if not exists provider_unchosen boolean not null default false;
