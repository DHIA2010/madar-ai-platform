-- Teams: cross-functional groups within an organization, optionally scoped to
-- a workspace, with a manager and a member roster.
-- Migration order: 013

create table if not exists teams (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  workspace_id uuid references workspaces(id),
  name varchar(200) not null,
  description text not null default '',
  color varchar(50) not null default 'bg-blue-500',
  manager_user_id uuid references users(id),
  created_by_user_id uuid not null references users(id),
  status varchar(20) not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_teams_org on teams(organization_id);
create index if not exists idx_teams_workspace on teams(workspace_id);
create index if not exists idx_teams_status on teams(status);

create table if not exists team_members (
  id uuid primary key,
  team_id uuid not null references teams(id),
  user_id uuid not null references users(id),
  added_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists idx_team_members_team on team_members(team_id);
create index if not exists idx_team_members_user on team_members(user_id);
