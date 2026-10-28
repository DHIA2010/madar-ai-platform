-- One row per day of Madar Admin's headline numbers, recorded when the overview is viewed
-- (platform-admin/service.ts getOverview). The overview's "compared to last month" changes are
-- read from the row ~30 days back; until that history exists they're simply not shown.
create table if not exists platform_daily_metrics (
  day date primary key,
  customers integer not null,
  stores integer not null,
  active_subscriptions integer not null,
  mrr_halalas integer not null,
  updated_at timestamptz not null default now()
);
