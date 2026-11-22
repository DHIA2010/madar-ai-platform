-- A gift card can be sent to the person it is for: a private link (this token) opens a card page
-- with who it is from, the message, the amount and the code. The token is not the code, so the
-- page cannot be found by guessing a code the business typed itself.
alter table booking_gift_cards add column if not exists share_token varchar(48);
create unique index if not exists uq_booking_gift_cards_share_token
  on booking_gift_cards(share_token);
