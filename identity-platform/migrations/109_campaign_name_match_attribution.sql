-- Order attribution: add 'campaign_name_match' as a resolution outcome -- an order whose
-- utm_campaign matches an imported ad-platform campaign's normalized_name directly (no
-- campaign_links row involved), for merchants who tagged their own ads with UTMs and never
-- built a link via Madar's Link Builder. See OrderAttributionService.resolveMatch() step 5b.

alter table order_attributions drop constraint order_attributions_match_method_check;

alter table order_attributions add constraint order_attributions_match_method_check check (
  match_method in (
    'explicit_id', 'campaign_link_id', 'session_id', 'customer_ref', 'utm_match',
    'campaign_name_match', 'unattributed'
  )
);
