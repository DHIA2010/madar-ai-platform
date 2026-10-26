-- "Supply & Purchase" (procurement) becomes its own independently-subscribed Madar app, widening
-- the existing 4-value application/category CHECK constraints to a 5th value. The already-built
-- suppliers/purchases/returns/vouchers features previously rode free on ecommerce/pos activation
-- (sidebar visibility only, no real backend enforcement) -- see procurement/guards.ts for the new
-- real enforcement these rows feed into via organizations.settings.procurementEnabled.
alter table subscription_activation_requests
  drop constraint if exists subscription_activation_requests_application_check;
alter table subscription_activation_requests
  add constraint subscription_activation_requests_application_check
    check (application in ('advertising', 'ecommerce', 'pos', 'madarApps', 'procurement'));

alter table chat_sessions
  drop constraint if exists chat_sessions_category_check;
alter table chat_sessions
  add constraint chat_sessions_category_check
    check (application_category in ('advertising', 'ecommerce', 'pos', 'madarApps', 'procurement'));

alter table billing_moyasar_payments
  drop constraint if exists billing_moyasar_payments_application_check;
alter table billing_moyasar_payments
  add constraint billing_moyasar_payments_application_check
    check (application in ('advertising', 'ecommerce', 'pos', 'madarApps', 'procurement'));
