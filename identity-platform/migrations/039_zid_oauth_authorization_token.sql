-- Zid's token response carries a distinct `authorization` field, separate from access_token,
-- that Zid's own docs (docs.zid.sa/authorization) associate with the Authorization header --
-- confirmed on stage to be a genuinely different, differently-shaped credential. Previously
-- this was used once during connect (fetchStoreInfo) and discarded; persisting it here lets
-- resolveAccessToken (used by every later sync/API call) use the same credential consistently
-- instead of only the initial connect flow having access to it.

alter table zid_oauth_connections add column if not exists encrypted_authorization_token text;
alter table zid_marketplace_installs add column if not exists encrypted_authorization_token text;
