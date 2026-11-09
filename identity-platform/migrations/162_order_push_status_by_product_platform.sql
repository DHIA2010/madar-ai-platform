-- Orders are now pushed only to the platforms their products belong to (a Salla-linked line to
-- Salla, a Zid-linked line to Zid -- see MadarOrdersService). Orders created before that still
-- show a pending/failed push to a platform none of their products came from; those become
-- "not applicable". A push that failed for an order that does have that platform's products is
-- left as it is, so it can still be retried.
update madar_orders
   set salla_push_status = 'not_applicable', updated_at = now()
 where salla_push_status in ('pending', 'failed')
   and id not in (
     select i.order_id
       from madar_order_items i
       join salla_product_links l on l.product_id = i.product_id
      where l.variant_id is null or l.variant_id = i.variant_id
   );

update madar_orders
   set zid_push_status = 'not_applicable', updated_at = now()
 where zid_push_status in ('pending', 'failed')
   and id not in (
     select i.order_id
       from madar_order_items i
       join zid_product_links l on l.product_id = i.product_id
      where l.variant_id is null or l.variant_id = i.variant_id
   );
