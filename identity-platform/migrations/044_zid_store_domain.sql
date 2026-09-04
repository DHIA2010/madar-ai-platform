-- Zid's App Scripts / Custom Snippets mechanism injects one script app-wide into every merchant
-- storefront where the app is installed, with no per-merchant configuration and no confirmed
-- client-side API for the injected script to read a store ID (unlike Salla's documented
-- salla.config.get('store.id')). This adds a domain-matching fallback: Zid's own
-- /managers/account/profile response (already fetched during OAuth connect, see
-- zid-oauth/service.ts's fetchStoreInfo) carries a real `url` field that just wasn't captured
-- before. Nullable -- existing connections stay null until the merchant reconnects.
alter table zid_oauth_connections add column if not exists store_domain text;
