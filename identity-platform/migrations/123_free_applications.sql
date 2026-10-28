-- An application can be sold as free (Madar Admin, Packages page): the customer activates it
-- without paying for a set number of days, up to a year.
alter table platform_app_pricing add column if not exists free_days integer;

alter table platform_app_pricing drop constraint if exists platform_app_pricing_mode_check;
alter table platform_app_pricing
  add constraint platform_app_pricing_mode_check
    check (pricing_mode in ('packages', 'fixed', 'contact', 'free'));

alter table platform_app_pricing drop constraint if exists platform_app_pricing_free_days_check;
alter table platform_app_pricing
  add constraint platform_app_pricing_free_days_check
    check (
      (pricing_mode <> 'free' and free_days is null)
      or (pricing_mode = 'free' and free_days between 1 and 365)
    );

alter table organization_subscriptions drop constraint if exists organization_subscriptions_source_check;
alter table organization_subscriptions
  add constraint organization_subscriptions_source_check
    check (source in ('trial', 'payment', 'bank_transfer', 'admin', 'existing', 'free'));
