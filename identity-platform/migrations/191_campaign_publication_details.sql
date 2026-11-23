-- Publishing a campaign from Madar now reaches TikTok, Meta and Google Ads as well as Snapchat
-- (campaigns/publishing). What only some platforms ask for is kept here: the text above a Meta
-- ad, and a Google search ad's headlines, descriptions and keywords.
alter table campaign_publications add column if not exists details jsonb;
