-- Mirrors migration 099's salla_* push-tracking columns, for Zid's own equivalent
-- (ZidOrderPushService pushing a Madar-created order into https://docs.zid.sa/create-order --
-- POST /managers/store/drafts). ON DELETE SET NULL from the start (not a follow-up migration the
-- way Salla's own connection FK needed, see migration 100) -- a disconnected Zid store must still
-- be disconnectable regardless of what orders were ever pushed through it; the order (and its
-- already-recorded zid_order_id) survives, zid_connection_id just goes null.
--
-- No zid_external_order_id/unique-index equivalent of Salla's own idempotency key: Zid's own
-- create-order schema (confirmed via docs.zid.sa) has no external-order-id field at all, so there
-- is no idempotent-retry signal to key off of the way Salla's external_order_id duplicate-check
-- gives one -- a known, accepted limitation (retrying a failed push risks a duplicate draft order
-- in Zid), not something this migration can fix on its own.
alter table madar_orders
  add column if not exists zid_connection_id uuid references zid_oauth_connections(id) on delete set null,
  add column if not exists zid_push_status text not null default 'not_applicable'
    check (zid_push_status in ('not_applicable', 'pending', 'pushed', 'failed')),
  add column if not exists zid_order_id text,
  add column if not exists zid_push_attempted_at timestamptz,
  add column if not exists zid_push_error_code text,
  add column if not exists zid_push_error_message text,
  add column if not exists zid_push_attempt_count integer not null default 0;

create index if not exists idx_madar_orders_zid_push_status on madar_orders(zid_push_status)
  where zid_push_status = 'failed';
