-- A customer activating a paid application (see organizations.settings.<app>Enabled, added in a
-- prior pass) now submits a request instead of flipping the flag instantly: they pick an
-- account-wide plan tier and attach a manual bank-transfer receipt, and a Madar staff member
-- approves or rejects it from the internal admin console. Only approval flips the setting.
-- Modeled directly on organization_invitations' pending -> accepted/declined shape, minus the
-- token/expiry machinery (a request doesn't expire on its own -- it waits for a human decision).

create table if not exists subscription_activation_requests (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  -- Denormalized at request time: the cross-tenant admin list needs a readable organization name
  -- without a second, genuinely cross-tenant "get any org" query per row.
  organization_name text not null,
  requested_by_user_id uuid not null references users(id),
  application varchar(32) not null,
  plan_tier varchar(32) not null,
  attachment_url text not null,
  attachment_content_type varchar(64) not null,
  status varchar(32) not null default 'pending',
  reviewed_by_user_id uuid references users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint subscription_activation_requests_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint subscription_activation_requests_application_check
    check (application in ('advertising', 'ecommerce', 'pos', 'madarApps')),
  constraint subscription_activation_requests_plan_tier_check
    check (plan_tier in ('starter', 'growth', 'pro', 'enterprise'))
);

create index if not exists idx_subscription_requests_org
  on subscription_activation_requests(organization_id);

create index if not exists idx_subscription_requests_status
  on subscription_activation_requests(status);

-- One pending request per org+application at a time -- mirrors
-- uq_organization_invitations_org_idempotency_pending's partial-unique-index shape.
create unique index if not exists uq_subscription_requests_org_app_pending
  on subscription_activation_requests (organization_id, application)
  where status = 'pending' and deleted_at is null;
