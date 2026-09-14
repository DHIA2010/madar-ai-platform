-- A suggested name for the invitee, set by the admin sending the invite -- used to personalize
-- the invitation email and pre-fill (not lock) the name field on the accept-invite/register page.
-- Nullable: invitations sent before this existed, and any future invite that omits it, have none.
alter table organization_invitations add column if not exists full_name text;
