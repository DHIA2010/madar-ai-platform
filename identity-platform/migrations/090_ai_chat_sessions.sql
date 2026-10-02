-- Backend for the AI chat assistant (src/app/(layout-pages)/ai) -- previously 100% mock. A
-- session is scoped to exactly one activated application category (see
-- src/identity-platform/ai-chat/guards.ts) so the model is only ever offered tools for data the
-- org has actually activated.

create table if not exists chat_sessions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  user_id uuid not null references users(id),
  application_category varchar(32) not null,
  title text,
  status varchar(32) not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_sessions_category_check
    check (application_category in ('advertising', 'ecommerce', 'pos', 'madarApps')),
  constraint chat_sessions_status_check
    check (status in ('active', 'archived'))
);

create index if not exists idx_chat_sessions_org_user
  on chat_sessions(organization_id, user_id, status);

create table if not exists chat_messages (
  id uuid primary key,
  session_id uuid not null references chat_sessions(id),
  role varchar(16) not null,
  content text not null,
  tool_calls jsonb,
  model varchar(64),
  created_at timestamptz not null default now(),
  constraint chat_messages_role_check
    check (role in ('user', 'assistant', 'system_notice'))
);

create index if not exists idx_chat_messages_session
  on chat_messages(session_id, created_at);
