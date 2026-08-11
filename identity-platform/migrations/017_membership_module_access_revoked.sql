-- Lets an admin explicitly grant a member zero module permissions ("None"
-- in the Users screen's unified role selector), distinct from simply not
-- having set a custom role (which falls back to the base role's defaults).
-- Migration order: 017

alter table memberships
  add column if not exists module_access_revoked boolean not null default false;
