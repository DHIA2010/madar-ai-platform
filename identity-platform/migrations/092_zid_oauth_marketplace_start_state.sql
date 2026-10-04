-- Zid support confirmed root cause (2026-10-04): the App Market "Activate" button sends a
-- merchant straight to our Callback URL with no `state`, because our Redirection URL was
-- configured as that same callback -- there was never an /oauth/authorize round trip to
-- originate one. The fix is a dedicated, unauthenticated start route (GET /v1/integrations/
-- zid/start) that generates a real state for that anonymous visitor before redirecting to Zid's
-- /oauth/authorize, so the callback's `!state -> exchange anyway` fallback can be removed and
-- state becomes mandatory and validated for every request, matching Zid's own OAuth Activation
-- Policy section 8.
--
-- Reuses zid_oauth_states (rather than a parallel table) for this new "marketplace" flow: the
-- admin-initiated "connect" flow always has a real organization/project/user/connection at
-- state-creation time, but an anonymous marketplace visitor has none of that yet -- so those four
-- columns become nullable, and `flow` distinguishes which validation/completion path a given
-- state row belongs to.

alter table zid_oauth_states
  alter column organization_id drop not null,
  alter column project_id drop not null,
  alter column user_id drop not null,
  alter column connection_id drop not null;

alter table zid_oauth_states
  add column if not exists flow varchar(32) not null default 'connect';

alter table zid_oauth_states drop constraint if exists zid_oauth_states_flow_check;
alter table zid_oauth_states add constraint zid_oauth_states_flow_check
  check (flow in ('connect', 'marketplace'));
