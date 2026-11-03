-- In-app notifications (the bell). One row per event for the whole organization; who sees it is
-- decided when it's read (see notifications/service.ts): `audience` is a module permission such as
-- 'products:view', 'admin' for owners and admins, or null for everyone, and a row with a
-- workspace_id belongs to that branch. Each user's read state is kept separately.
create table if not exists notifications (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  type varchar(64) not null,
  audience varchar(64),
  -- The facts the message is built from (product name, order number, ...); the text itself is
  -- rendered in the reader's language.
  params jsonb not null default '{}'::jsonb,
  link text,
  -- Stops the same event being announced twice (e.g. one low-stock alert per product, branch and
  -- day); null when every occurrence counts.
  dedupe_key text,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_org_created
  on notifications(organization_id, created_at desc);
create unique index if not exists uq_notifications_dedupe
  on notifications(organization_id, dedupe_key);

create table if not exists notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists idx_notification_reads_user on notification_reads(user_id);
