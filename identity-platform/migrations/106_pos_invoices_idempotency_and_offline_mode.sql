-- Supports POS offline mode: a sale completed with no network is queued client-side (IndexedDB)
-- and replayed once the connection returns. Without this, replaying PosInvoicesService.create()
-- twice for the same sale (an ambiguous network failure, or the service worker's background sync
-- and the foreground tab both flushing the same queued item) would create a second real invoice,
-- decrement stock twice, double-debit a customer's wallet, and double-advance the ZATCA Phase-2
-- hash chain.
--
-- idempotency_key is the client-generated uuid the offline queue reuses across retries of the
-- same sale attempt. Postgres treats every NULL as distinct from every other NULL in a unique
-- index, so every pre-existing (and every future non-offline) invoice -- which never sends a key
-- -- is completely unaffected; only two rows that both provide the *same* real key can conflict.
alter table pos_invoices
  add column if not exists idempotency_key text;

create unique index if not exists pos_invoices_org_idempotency_key_key
  on pos_invoices (organization_id, idempotency_key);

alter table pos_settings
  add column if not exists offline_mode_enabled boolean not null default false;
