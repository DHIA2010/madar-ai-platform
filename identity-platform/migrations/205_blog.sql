-- Madar's own blog on madar.my, kept in the database so an article can go out without a deploy.
-- The first articles stay in the code (posts.ts) and are shown next to these.
--
-- An article is written as a draft (by the blog agent or by hand), approved in Madar Admin, and
-- given a publishing time. It shows on the site once that time has passed -- no job needed.
create table if not exists blog_posts (
  id uuid primary key,
  slug varchar(120) not null unique,
  title text not null,
  excerpt text not null,
  category varchar(32) not null,
  body jsonb not null default '[]'::jsonb,
  faq jsonb not null default '[]'::jsonb,
  seo_title text,
  seo_description text,
  keywords jsonb not null default '[]'::jsonb,
  cta_app varchar(32),
  kind varchar(16) not null default 'guide',
  feature_keys jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  status varchar(16) not null default 'draft',
  source varchar(16) not null default 'agent',
  week_start date,
  scheduled_at timestamptz,
  approved_at timestamptz,
  approved_by varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_posts_status_check check (status in ('draft', 'approved', 'rejected'))
);

create index if not exists blog_posts_status_idx on blog_posts (status, scheduled_at);

-- What readers do on an article: a view, how far they read, which button they tapped.
create table if not exists blog_post_events (
  id bigserial primary key,
  slug varchar(120) not null,
  event varchar(24) not null,
  cta varchar(48),
  visitor_id varchar(64),
  source varchar(32),
  device varchar(16),
  created_at timestamptz not null default now()
);

create index if not exists blog_post_events_slug_idx on blog_post_events (slug, created_at);
create index if not exists blog_post_events_created_idx on blog_post_events (created_at);

-- One row: when articles go out and whether the agent writes each week.
create table if not exists blog_settings (
  id smallint primary key default 1,
  agent_enabled boolean not null default true,
  posts_per_week smallint not null default 3,
  publish_days jsonb not null default '[1, 3, 6]'::jsonb,
  publish_hour smallint not null default 10,
  updated_at timestamptz not null default now(),
  constraint blog_settings_single check (id = 1)
);

insert into blog_settings (id) values (1) on conflict (id) do nothing;

-- One row per week the agent wrote (or tried to). The unique week stops two servers writing
-- the same week twice.
create table if not exists blog_agent_runs (
  week_start date primary key,
  status varchar(16) not null default 'running',
  posts_written smallint not null default 0,
  attempts smallint not null default 1,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
