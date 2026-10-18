-- madar_orders.salla_connection_id (migration 099) had no explicit ON DELETE behavior, which
-- defaults to NO ACTION -- the moment any order actually referenced a connection, disconnecting
-- that Salla store (SallaOAuthConnectionDeletionService.deleteConnection(), a real hard DELETE
-- FROM salla_oauth_connections) started failing outright with a foreign key violation instead of
-- actually disconnecting. A disconnected store must still be disconnectable regardless of what
-- orders were ever pushed through it -- the order itself (and its already-recorded
-- salla_order_id/salla_reference_id push history) is still real and should stay, it just no
-- longer has a live connection to retry a push against. ON DELETE SET NULL is exactly that: the
-- order survives, salla_connection_id goes null, and a future retry correctly reports "no
-- connected Salla store" instead of referencing a connection that no longer exists.
alter table madar_orders drop constraint if exists madar_orders_salla_connection_id_fkey;
alter table madar_orders
  add constraint madar_orders_salla_connection_id_fkey
  foreign key (salla_connection_id) references salla_oauth_connections(id) on delete set null;
