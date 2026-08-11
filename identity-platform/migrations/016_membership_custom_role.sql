-- Lets a membership optionally reference a custom role in addition to its
-- fixed system role. The system role continues to gate real backend
-- authorization unchanged; the custom role (when set) is the source of
-- truth for that member's module/action permission grants.
-- Migration order: 016

alter table memberships
  add column if not exists custom_role_id uuid references custom_roles(id);
