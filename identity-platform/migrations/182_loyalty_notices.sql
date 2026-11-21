-- What a member was told (new points, a message from the business), kept on their card so it
-- can be read later: a phone's notification is gone once it is dismissed.
create table if not exists loyalty_notices (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  member_id uuid not null references loyalty_members(id) on delete cascade,
  -- points: about the member's own points. message: written by the business.
  kind varchar(12) not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_loyalty_notices_member on loyalty_notices(member_id, created_at);
