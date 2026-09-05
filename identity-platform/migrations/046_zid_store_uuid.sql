-- Zid's storefront Custom Snippet parameter {{store.id}} expands to the store's UUID, not the
-- numeric id that /managers/account/profile returns as user.store.id -- confirmed against a real
-- storefront, which sent a2701fa2-7128-423c-857c-9cc7f3781144 while the connected store's
-- provider_account_id was 3223383, so GET /v1/tracking/resolve/zid/store/:id could never match.
--
-- Zid's own profile response already carries both (user.store.id and user.store.uuid, both
-- present in this connector's ZidManagerProfileResponse type); only the numeric one was ever
-- persisted. This adds the UUID alongside it so the resolve route can match whichever identifier
-- the storefront actually sends.
alter table zid_oauth_connections add column if not exists store_uuid text;

create index if not exists idx_zid_oauth_connections_store_uuid
  on zid_oauth_connections(store_uuid)
  where store_uuid is not null and deleted_at is null;

-- The marketplace-install flow (Zid App Market "Activate") exchanges tokens before any MADAR
-- organization exists, parking the result here until the merchant claims it. It persisted only
-- name/currency/timezone, so the store URL and UUID were lost by the time a connection row was
-- created -- meaning a merchant who arrived through the App Market got neither tracking
-- identifier and had to reconnect through the direct flow before tracking could ever resolve.
-- Carrying both through closes that gap.
alter table zid_marketplace_installs add column if not exists zid_store_uuid text;
alter table zid_marketplace_installs add column if not exists zid_store_domain text;
