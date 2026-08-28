-- TikTok already syncs campaign/adgroup/ad entities, but insights (performance metrics)
-- were only ever fetched at campaign granularity. Adds ad-group and ad-level insights,
-- same full-history depth as campaign-level. Reuses tiktok_ads_records' existing generic
-- entity_type/payload pattern -- no new table.

alter table tiktok_ads_records drop constraint if exists tiktok_ads_records_entity_type_check;
alter table tiktok_ads_records add constraint tiktok_ads_records_entity_type_check
  check (entity_type in ('campaigns', 'adgroups', 'ads', 'insights', 'adgroup_insights', 'ad_insights'));
