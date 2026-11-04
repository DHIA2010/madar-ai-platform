-- Where a lead came from: the UTM tags / ad click id / referring site of its first and latest
-- visit to madar.my ({ first, last }), sent with the talk-to-sales form and the sign-up.
alter table sales_leads add column if not exists attribution jsonb;
alter table crm_leads add column if not exists attribution jsonb;
