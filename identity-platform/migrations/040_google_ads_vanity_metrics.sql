-- Additive columns for the Campaigns performance dashboard's platform-specific metrics.
-- Real typed columns (not payload jsonb) since Phase 4's aggregation needs SUM()/AVG()
-- over these directly, matching this table's existing "typed columns for anything
-- aggregated" convention. Field names verified against the Google Ads API v22 metrics.proto
-- (the pinned API version, see dependency-injection/container.ts) -- not guessed.

-- Quality Score is a static/current-value attribute (ad_group_criterion.quality_info),
-- not date-segmented like metrics.* fields, so it lives on the keyword metadata row.
alter table google_ads_keywords
  add column if not exists quality_score integer;

alter table google_ads_daily_metrics
  add column if not exists search_impression_share numeric(6, 4),
  add column if not exists search_top_impression_share numeric(6, 4),
  add column if not exists search_absolute_top_impression_share numeric(6, 4),
  add column if not exists active_view_impressions bigint,
  add column if not exists active_view_measurable_impressions bigint,
  add column if not exists active_view_measurable_cost_micros bigint,
  add column if not exists active_view_viewability numeric(6, 4),
  add column if not exists video_views bigint,
  add column if not exists video_quartile_p25_rate numeric(6, 4),
  add column if not exists video_quartile_p50_rate numeric(6, 4),
  add column if not exists video_quartile_p75_rate numeric(6, 4),
  add column if not exists video_quartile_p100_rate numeric(6, 4),
  add column if not exists average_watch_time_seconds numeric(12, 4);
