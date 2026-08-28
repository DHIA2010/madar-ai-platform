-- Meta today only syncs campaign-level entities/insights -- no ad sets (Meta's ad-group
-- equivalent), no ad-set/ad-level performance data. The Campaigns dashboard's real
-- drill-down needs both. Existing 'insights' stays campaign-level (backward compatible,
-- no rewrite of existing rows); new 'adsets'/'adset_insights'/'ad_insights' cover the rest.
-- Reuses meta_records' existing generic entity_type/payload pattern -- no new table.

alter table meta_records drop constraint if exists meta_records_entity_type_check;
alter table meta_records add constraint meta_records_entity_type_check
  check (entity_type in ('campaigns', 'adsets', 'ads', 'insights', 'adset_insights', 'ad_insights'));
