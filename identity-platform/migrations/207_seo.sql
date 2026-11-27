-- Madar's own SEO page in Madar Admin: Google Search Console numbers for madar.my, read with a
-- Google service account that has view access to the Search Console property.

-- One row: the service account key (sealed) and the Search Console property it reads.
create table if not exists seo_settings (
  id smallint primary key default 1,
  sealed_service_account text,
  client_email varchar(320),
  site_url varchar(320),
  connected_at timestamptz,
  connected_by varchar(255),
  updated_at timestamptz not null default now(),
  constraint seo_settings_single check (id = 1)
);

insert into seo_settings (id) values (1) on conflict (id) do nothing;

-- The searches Madar Admin follows day by day (their position comes from Search Console).
create table if not exists seo_tracked_keywords (
  id uuid primary key,
  keyword varchar(200) not null,
  created_by varchar(255),
  created_at timestamptz not null default now()
);

create unique index if not exists seo_tracked_keywords_keyword_idx
  on seo_tracked_keywords (keyword);
