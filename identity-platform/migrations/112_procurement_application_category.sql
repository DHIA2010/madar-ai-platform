-- "Supply & Purchase" (procurement) becomes its own independently-subscribed Madar app, widening
-- the existing 4-value application/category CHECK constraints to a 5th value. The already-built
-- suppliers/purchases/returns/vouchers features previously rode free on ecommerce/pos activation
-- (sidebar visibility only, no real backend enforcement) -- see procurement/guards.ts for the new
-- real enforcement these rows feed into via organizations.settings.procurementEnabled.
-- Migrations re-run on every deploy, so this re-adds each constraint with today's full list
-- (the same lists later migrations end on) rather than the narrower list of its day -- re-adding
-- a narrower list fails once rows for a newer application exist (a stage deploy did).
alter table subscription_activation_requests
  drop constraint if exists subscription_activation_requests_application_check;
alter table subscription_activation_requests
  add constraint subscription_activation_requests_application_check
    check (application in (
      'advertising', 'ecommerce', 'pos', 'madarApps', 'procurement', 'expenses', 'ai',
      'customReports', 'madarComplete'
    ));

alter table chat_sessions
  drop constraint if exists chat_sessions_category_check;
alter table chat_sessions
  add constraint chat_sessions_category_check
    check (application_category in (
      'advertising', 'ecommerce', 'pos', 'madarApps', 'procurement', 'expenses', 'ai', 'customReports'
    ));

alter table billing_moyasar_payments
  drop constraint if exists billing_moyasar_payments_application_check;
alter table billing_moyasar_payments
  add constraint billing_moyasar_payments_application_check
    check (application in (
      'advertising', 'ecommerce', 'pos', 'madarApps', 'procurement', 'expenses', 'ai',
      'customReports', 'madarComplete'
    ));
