-- Teams grant permissions by referencing an existing role (one of the fixed
-- system roles, or an org's custom role) rather than owning a separate
-- permission list. Members of a team take on whatever that role grants.
-- Migration order: 015

alter table teams
  add column if not exists role_reference varchar(64);
