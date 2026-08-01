create table if not exists migration_google_ads_connection_id_map_010 (
  canonical_id uuid primary key,
  legacy_id uuid not null unique
);

truncate table migration_google_ads_connection_id_map_010;

insert into migration_google_ads_connection_id_map_010 (canonical_id, legacy_id)
select distinct on (ic.id)
  ic.id as canonical_id,
  g.id as legacy_id
from integration_connections ic
join google_oauth_connections g
  on g.organization_id = ic.organization_id
 and g.project_id = ic.project_id
 and g.provider = 'google_ads'
 and g.deleted_at is null
where ic.provider_id = 'google-ads'
  and ic.deleted_at is null
  and g.id <> ic.id
order by ic.id, g.updated_at desc;

update google_oauth_connections
set deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where id in (
  select m.legacy_id
  from migration_google_ads_connection_id_map_010 m
  where m.canonical_id not in (
    select id
    from google_oauth_connections
  )
)
  and deleted_at is null;

insert into oauth_accounts (
  id,
  provider_family,
  organization_id,
  workspace_id,
  provider_subject_id,
  provider_email,
  provider_display_name,
  granted_scopes,
  status,
  last_authenticated_at,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  deleted_at
)
select
  m.canonical_id,
  oa.provider_family,
  oa.organization_id,
  oa.workspace_id,
  oa.provider_subject_id,
  oa.provider_email,
  oa.provider_display_name,
  oa.granted_scopes,
  oa.status,
  oa.last_authenticated_at,
  oa.created_by_user_id,
  oa.updated_by_user_id,
  oa.created_at,
  oa.updated_at,
  oa.deleted_at
from migration_google_ads_connection_id_map_010 m
join oauth_accounts oa
  on oa.id = m.legacy_id
left join oauth_accounts existing
  on existing.id = m.canonical_id
where existing.id is null;

update oauth_tokens
set oauth_account_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where oauth_tokens.oauth_account_id = m.legacy_id;

update oauth_states
set oauth_account_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where oauth_states.oauth_account_id = m.legacy_id;

update oauth_states
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where oauth_states.connection_id = m.legacy_id;

insert into google_oauth_connections (
  id,
  provider,
  organization_id,
  workspace_id,
  project_id,
  data_source_id,
  provider_account_id,
  provider_account_name,
  provider_account_email,
  encrypted_refresh_token,
  encrypted_access_token,
  scopes,
  token_expires_at,
  status,
  connection_reference,
  last_connected_at,
  last_disconnected_at,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  deleted_at
)
select
  m.canonical_id,
  g.provider,
  g.organization_id,
  g.workspace_id,
  g.project_id,
  g.data_source_id,
  g.provider_account_id,
  g.provider_account_name,
  g.provider_account_email,
  g.encrypted_refresh_token,
  g.encrypted_access_token,
  g.scopes,
  g.token_expires_at,
  g.status,
  g.connection_reference,
  g.last_connected_at,
  g.last_disconnected_at,
  g.created_by_user_id,
  g.updated_by_user_id,
  g.created_at,
  g.updated_at,
  null as deleted_at
from migration_google_ads_connection_id_map_010 m
join google_oauth_connections g
  on g.id = m.legacy_id
left join google_oauth_connections existing
  on existing.id = m.canonical_id
where existing.id is null;

update integration_connections
set oauth_account_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where integration_connections.provider_id = 'google-ads'
  and integration_connections.id = m.canonical_id;

update integration_connections
set oauth_account_id = id,
    updated_at = now()
where provider_id = 'google-ads'
  and deleted_at is null
  and oauth_account_id is null
  and exists (
    select 1
    from oauth_accounts oa
    where oa.id = id
  );

update google_oauth_states
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_oauth_states.connection_id = m.legacy_id;

update google_oauth_events
set connection_id = m.canonical_id
from migration_google_ads_connection_id_map_010 m
where google_oauth_events.connection_id = m.legacy_id;

update google_ads_customer_accounts
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_customer_accounts.connection_id = m.legacy_id;

update google_ads_sync_runs
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_sync_runs.connection_id = m.legacy_id;

update google_ads_domain_records
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_domain_records.connection_id = m.legacy_id;

update google_ads_sync_locks
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_sync_locks.connection_id = m.legacy_id;

update google_ads_sync_checkpoints
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_sync_checkpoints.connection_id = m.legacy_id;

update google_ads_sync_cursors
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_sync_cursors.connection_id = m.legacy_id;

update google_ads_campaigns
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_campaigns.connection_id = m.legacy_id;

update google_ads_ad_groups
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_ad_groups.connection_id = m.legacy_id;

update google_ads_ads
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_ads.connection_id = m.legacy_id;

update google_ads_keywords
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_keywords.connection_id = m.legacy_id;

update google_ads_conversion_actions
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_conversion_actions.connection_id = m.legacy_id;

update google_ads_daily_metrics
set connection_id = m.canonical_id,
    updated_at = now()
from migration_google_ads_connection_id_map_010 m
where google_ads_daily_metrics.connection_id = m.legacy_id;

update outbox_events
set aggregate_id = m.canonical_id
from migration_google_ads_connection_id_map_010 m
where outbox_events.aggregate_type = 'google_oauth_connection'
  and outbox_events.aggregate_id = m.legacy_id;

update audit_logs
set entity_id = m.canonical_id
from migration_google_ads_connection_id_map_010 m
where audit_logs.entity_type = 'google_oauth_connection'
  and audit_logs.entity_id = m.legacy_id;

alter table google_ads_sync_runs drop constraint if exists google_ads_sync_runs_connection_id_fkey;
alter table google_ads_domain_records drop constraint if exists google_ads_domain_records_connection_id_fkey;
alter table google_ads_sync_locks drop constraint if exists google_ads_sync_locks_connection_id_fkey;
alter table google_ads_sync_checkpoints drop constraint if exists google_ads_sync_checkpoints_connection_id_fkey;
alter table google_ads_sync_cursors drop constraint if exists google_ads_sync_cursors_connection_id_fkey;
alter table google_ads_customer_accounts drop constraint if exists google_ads_customer_accounts_connection_id_fkey;
alter table google_ads_campaigns drop constraint if exists google_ads_campaigns_connection_id_fkey;
alter table google_ads_ad_groups drop constraint if exists google_ads_ad_groups_connection_id_fkey;
alter table google_ads_ads drop constraint if exists google_ads_ads_connection_id_fkey;
alter table google_ads_keywords drop constraint if exists google_ads_keywords_connection_id_fkey;
alter table google_ads_conversion_actions drop constraint if exists google_ads_conversion_actions_connection_id_fkey;
alter table google_ads_daily_metrics drop constraint if exists google_ads_daily_metrics_connection_id_fkey;

alter table google_ads_sync_runs
  add constraint google_ads_sync_runs_connection_id_fkey
  foreign key (connection_id) references integration_connections(id);

alter table google_ads_domain_records
  add constraint google_ads_domain_records_connection_id_fkey
  foreign key (connection_id) references integration_connections(id);

alter table google_ads_sync_locks
  add constraint google_ads_sync_locks_connection_id_fkey
  foreign key (connection_id) references integration_connections(id);

alter table google_ads_sync_checkpoints
  add constraint google_ads_sync_checkpoints_connection_id_fkey
  foreign key (connection_id) references integration_connections(id);

alter table google_ads_sync_cursors
  add constraint google_ads_sync_cursors_connection_id_fkey
  foreign key (connection_id) references integration_connections(id);

alter table google_ads_customer_accounts
  add constraint google_ads_customer_accounts_connection_id_fkey
  foreign key (connection_id) references integration_connections(id) on delete cascade;

alter table google_ads_campaigns
  add constraint google_ads_campaigns_connection_id_fkey
  foreign key (connection_id) references integration_connections(id) on delete cascade;

alter table google_ads_ad_groups
  add constraint google_ads_ad_groups_connection_id_fkey
  foreign key (connection_id) references integration_connections(id) on delete cascade;

alter table google_ads_ads
  add constraint google_ads_ads_connection_id_fkey
  foreign key (connection_id) references integration_connections(id) on delete cascade;

alter table google_ads_keywords
  add constraint google_ads_keywords_connection_id_fkey
  foreign key (connection_id) references integration_connections(id) on delete cascade;

alter table google_ads_conversion_actions
  add constraint google_ads_conversion_actions_connection_id_fkey
  foreign key (connection_id) references integration_connections(id) on delete cascade;

alter table google_ads_daily_metrics
  add constraint google_ads_daily_metrics_connection_id_fkey
  foreign key (connection_id) references integration_connections(id) on delete cascade;

delete from google_oauth_connections
where id in (
  select legacy_id
  from migration_google_ads_connection_id_map_010
);

delete from oauth_accounts
where id in (
  select m.legacy_id
  from migration_google_ads_connection_id_map_010 m
  left join integration_connections ic
    on ic.oauth_account_id = m.legacy_id
  where ic.oauth_account_id is null
);

drop table if exists migration_google_ads_connection_id_map_010;
