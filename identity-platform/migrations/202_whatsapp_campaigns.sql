-- WhatsApp marketing campaigns: a business sends a promotion to a chosen group of its own
-- customers, from its own connected business number (Meta bills the business). An offer is the
-- business's own marketing template, reviewed by Meta before it can be sent.

-- A customer who tapped "إيقاف العروض" (or wrote stop) gets no more promotions.
alter table customers add column if not exists marketing_opt_out_at timestamptz;

create table if not exists whatsapp_offers (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  -- What the business calls it, and the template's name at Meta.
  title text not null,
  template_name varchar(80) not null,
  body text not null,
  image_url text,
  button_text varchar(25),
  button_url text,
  -- PENDING, APPROVED, REJECTED, PAUSED, DISABLED (Meta's word), or FAILED when Meta refused it.
  status varchar(16) not null default 'PENDING',
  rejected_reason text,
  checked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_whatsapp_offers_org on whatsapp_offers(organization_id, created_at);

create table if not exists whatsapp_campaigns (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  offer_id uuid not null references whatsapp_offers(id),
  -- Who it goes to: { kind, days?, minAmount?, minPoints? } (whatsapp/campaigns.ts).
  audience jsonb not null default '{}'::jsonb,
  -- scheduled: waiting for its time. sending: going out in batches. sent: done.
  -- cancelled: called off before it finished. failed: could not be sent at all.
  status varchar(12) not null default 'scheduled',
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  -- How many days after sending a purchase still counts as the campaign's.
  track_days integer not null default 7,
  recipients integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_whatsapp_campaigns_org on whatsapp_campaigns(organization_id, created_at);
create index if not exists idx_whatsapp_campaigns_due on whatsapp_campaigns(status, scheduled_at);

-- One customer of a campaign. queued: waiting. claimed: being sent now. sent, delivered, read:
-- Meta's word for it. failed: Meta refused or could not deliver (error says why).
create table if not exists whatsapp_campaign_recipients (
  id uuid primary key,
  campaign_id uuid not null references whatsapp_campaigns(id) on delete cascade,
  organization_id uuid not null,
  customer_id uuid,
  name text,
  phone varchar(20) not null,
  token varchar(16) not null,
  status varchar(12) not null default 'queued',
  wa_message_id text,
  error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  clicked_at timestamptz,
  clicks integer not null default 0,
  replied_at timestamptz,
  opted_out_at timestamptz
);
create index if not exists idx_whatsapp_campaign_recipients_campaign
  on whatsapp_campaign_recipients(campaign_id, status);
create unique index if not exists idx_whatsapp_campaign_recipients_token
  on whatsapp_campaign_recipients(token);
create index if not exists idx_whatsapp_campaign_recipients_wamid
  on whatsapp_campaign_recipients(wa_message_id);
create index if not exists idx_whatsapp_campaign_recipients_phone
  on whatsapp_campaign_recipients(organization_id, phone);
