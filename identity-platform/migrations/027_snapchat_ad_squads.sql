-- Adds Ad Squads (ad sets) as a synced entity for Snapchat, completing the full
-- Campaigns -> Ad Squads -> Ads hierarchy alongside the campaigns/ads already synced.
-- Daily stats at all three levels continue to use the existing 'stats' entity_type
-- (distinguished by a "level" field in the payload), so no change is needed there.
alter table snapchat_records drop constraint if exists snapchat_records_entity_type_check;
alter table snapchat_records add constraint snapchat_records_entity_type_check
  check (entity_type in ('campaigns', 'ad_squads', 'ads', 'stats'));
