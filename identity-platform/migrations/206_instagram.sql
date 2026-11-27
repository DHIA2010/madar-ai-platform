-- Madar's own Instagram: the connected account, the agent's weekly posts, and their publishing.
-- Like the blog: the agent writes drafts, a person approves them in Madar Admin, and each one is
-- published on its day. Nothing is posted without approval.

-- One row: the connected Instagram professional account (through its Facebook page) and the
-- weekly settings. The page token is sealed with the Meta connection key.
create table if not exists instagram_settings (
  id smallint primary key default 1,
  page_id varchar(64),
  page_name text,
  ig_user_id varchar(64),
  ig_username varchar(120),
  ig_picture_url text,
  sealed_page_token text,
  connected_at timestamptz,
  connected_by varchar(255),
  agent_enabled boolean not null default true,
  posts_per_week smallint not null default 3,
  publish_days jsonb not null default '[0, 2, 4]'::jsonb,
  publish_hour smallint not null default 20,
  updated_at timestamptz not null default now(),
  constraint instagram_settings_single check (id = 1)
);

insert into instagram_settings (id) values (1) on conflict (id) do nothing;

-- A sign-in started from Madar Admin, matched when Meta sends the person back.
create table if not exists instagram_oauth_states (
  state varchar(120) primary key,
  user_id varchar(255) not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- One post: the design (template + its words), the caption, and where it is in its life.
create table if not exists instagram_posts (
  id uuid primary key,
  template varchar(8) not null,
  design jsonb not null default '{}'::jsonb,
  caption text not null,
  hashtags jsonb not null default '[]'::jsonb,
  first_comment text,
  topic text,
  kind varchar(16) not null default 'tip',
  feature_keys jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  image_url text,
  status varchar(16) not null default 'draft',
  source varchar(16) not null default 'agent',
  week_start date,
  scheduled_at timestamptz,
  approved_at timestamptz,
  approved_by varchar(255),
  published_at timestamptz,
  ig_media_id varchar(64),
  permalink text,
  publish_attempts smallint not null default 0,
  last_error text,
  insights jsonb,
  insights_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_posts_status_check
    check (status in ('draft', 'approved', 'publishing', 'published', 'failed', 'rejected'))
);

create index if not exists instagram_posts_status_idx on instagram_posts (status, scheduled_at);

-- One row per week the agent wrote (or tried to).
create table if not exists instagram_agent_runs (
  week_start date primary key,
  status varchar(16) not null default 'running',
  posts_written smallint not null default 0,
  attempts smallint not null default 1,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
