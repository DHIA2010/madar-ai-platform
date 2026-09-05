-- Zid's Custom Snippets expose the storefront's own {{store.id}} as a snippet parameter, which
-- makes store-ID matching possible where migration 044 could only offer domain matching. The
-- store ID is strictly more reliable: zid_oauth_connections.provider_account_id is populated for
-- every connection at OAuth connect time (zid-oauth/service.ts sets it from the real
-- /managers/account/profile `user.store.id`), whereas store_domain was added later as a nullable
-- column, so every pre-044 connection has it null and can never resolve. Domain matching is also
-- fragile in ways a numeric ID is not -- custom domains, www./bare variants, and *.zid.store
-- subdomains all diverge from whatever the profile `url` field happened to hold.
--
-- No schema change is needed (provider_account_id already exists, migration 028) -- only an index,
-- since GET /v1/tracking/resolve/zid/store/:id looks up by this column on every storefront page
-- load, and migration 028 indexed only org/workspace/project/status.
create index if not exists idx_zid_oauth_connections_provider_account_id
  on zid_oauth_connections(provider_account_id)
  where provider_account_id is not null and deleted_at is null;
